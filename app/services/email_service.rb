class EmailService
  # Result structure for consistent return values
  Result = Struct.new(:success, :message, :error_code, keyword_init: true) do
    def success?
      success
    end

    def failure?
      !success
    end
  end

  # Error codes for different failure scenarios
  ERROR_CODES = {
    pdf_not_available: 'PDF_NOT_AVAILABLE',
    customer_email_missing: 'CUSTOMER_EMAIL_MISSING',
    invalid_email_format: 'INVALID_EMAIL_FORMAT',
    mailer_error: 'MAILER_ERROR',
    attachment_too_large: 'ATTACHMENT_TOO_LARGE',
    smtp_connection_failed: 'SMTP_CONNECTION_FAILED',
    smtp_authentication_failed: 'SMTP_AUTHENTICATION_FAILED',
    unknown_error: 'UNKNOWN_ERROR'
  }.freeze

  # Maximum attachment size (25MB - typical email limit)
  MAX_ATTACHMENT_SIZE = 25.megabytes

  class << self
    # Main method to send inspection PDF via email
    # @param form_fill [FormFill] The form fill containing the PDF to send
    # @param recipient_email [String, nil] Optional override for recipient email
    # @return [Result] Success/failure result with message and error code
    def send_inspection_pdf(form_fill, recipient_email = nil)
      if form_fill.nil?
        return Result.new(
          success: false,
          message: 'Invalid inspection data',
          error_code: ERROR_CODES[:unknown_error]
        )
      end

      Rails.logger.info "EmailService: Starting email send process for FormFill ##{form_fill.id}"

      # Validate prerequisites
      validation_result = validate_prerequisites(form_fill, recipient_email)
      return validation_result if validation_result.failure?

      # Extract customer and property data
      customer = form_fill.inspection.property.customer
      property = form_fill.inspection.property
      inspection = form_fill.inspection
      inspector = inspection.user

      # Determine recipient email
      final_recipient = recipient_email.presence || customer.email

      begin
        # Log email sending attempt
        Rails.logger.info "EmailService: Sending email to #{final_recipient} for FormFill ##{form_fill.id}"
        Rails.logger.info "EmailService: Property: #{property.property_name}, Customer: #{customer.name}"

        # Send email via mailer
        InspectionMailer.send_inspection_pdf(form_fill.id, final_recipient).deliver_now

        # Log successful email sending
        Rails.logger.info "EmailService: Successfully sent email to #{final_recipient} for FormFill ##{form_fill.id}"

        Result.new(
          success: true,
          message: "Email sent successfully to #{final_recipient}"
        )
      rescue Net::SMTPAuthenticationError => e
        error_message = 'SMTP authentication failed'
        Rails.logger.error "EmailService: #{error_message} for FormFill ##{form_fill.id}: #{e.message}"

        Result.new(
          success: false,
          message: 'Email service authentication failed. Please contact administrator.',
          error_code: ERROR_CODES[:smtp_authentication_failed]
        )
      rescue Net::SMTPServerBusy, Net::SMTPFatalError, Net::SMTPSyntaxError => e
        error_message = 'SMTP connection failed'
        Rails.logger.error "EmailService: #{error_message} for FormFill ##{form_fill.id}: #{e.message}"

        Result.new(
          success: false,
          message: 'Email service is currently unavailable. Please try again later.',
          error_code: ERROR_CODES[:smtp_connection_failed]
        )
      rescue ArgumentError => e
        # Handle specific mailer errors (PDF not available, etc.)
        if e.message.include?('PDF not available')
          Rails.logger.error "EmailService: PDF not available for FormFill ##{form_fill.id}: #{e.message}"

          Result.new(
            success: false,
            message: 'PDF is not available for email attachment',
            error_code: ERROR_CODES[:pdf_not_available]
          )
        elsif e.message.include?('No recipient email')
          Rails.logger.error "EmailService: No recipient email for FormFill ##{form_fill.id}: #{e.message}"

          Result.new(
            success: false,
            message: 'Customer email address is not available',
            error_code: ERROR_CODES[:customer_email_missing]
          )
        else
          Rails.logger.error "EmailService: Mailer argument error for FormFill ##{form_fill.id}: #{e.message}"

          Result.new(
            success: false,
            message: 'Email configuration error. Please contact administrator.',
            error_code: ERROR_CODES[:mailer_error]
          )
        end
      rescue StandardError => e
        # Catch-all for unexpected errors
        Rails.logger.error "EmailService: Unexpected error for FormFill ##{form_fill.id}: #{e.class} - #{e.message}"
        Rails.logger.error "EmailService: Backtrace: #{e.backtrace.first(5).join(', ')}"

        Result.new(
          success: false,
          message: 'An unexpected error occurred while sending email. Please try again.',
          error_code: ERROR_CODES[:unknown_error]
        )
      end
    end

    private

    # Validate all prerequisites for sending email
    # @param form_fill [FormFill] The form fill to validate
    # @param recipient_email [String, nil] Optional recipient email override
    # @return [Result] Validation result
    def validate_prerequisites(form_fill, recipient_email = nil)
      # Validate form_fill exists and has required associations
      unless form_fill&.inspection&.property&.customer
        Rails.logger.error "EmailService: Invalid form_fill or missing associations for FormFill ##{form_fill&.id}"
        return Result.new(
          success: false,
          message: 'Invalid inspection data',
          error_code: ERROR_CODES[:unknown_error]
        )
      end

      # Validate PDF availability
      unless pdf_available?(form_fill)
        Rails.logger.warn "EmailService: PDF not available for FormFill ##{form_fill.id}"
        return Result.new(
          success: false,
          message: 'PDF is not available. Please generate the PDF first.',
          error_code: ERROR_CODES[:pdf_not_available]
        )
      end

      # Validate PDF size
      pdf_size_result = validate_pdf_size(form_fill)
      return pdf_size_result if pdf_size_result.failure?

      # Validate customer email
      email_validation_result = validate_customer_email(form_fill, recipient_email)
      return email_validation_result if email_validation_result.failure?

      # All validations passed
      Result.new(success: true, message: 'Validation successful')
    end

    # Check if PDF is available for the form fill
    # @param form_fill [FormFill] The form fill to check
    # @return [Boolean] True if PDF is available
    def pdf_available?(form_fill)
      form_fill.filled_pdf.attached? &&
        form_fill.pdf_generation_status == 'completed'
    end

    # Validate PDF file size
    # @param form_fill [FormFill] The form fill to check
    # @return [Result] Validation result
    def validate_pdf_size(form_fill)
      return Result.new(success: true, message: 'PDF size validation passed') unless form_fill.filled_pdf.attached?

      pdf_size = form_fill.filled_pdf.byte_size

      if pdf_size > MAX_ATTACHMENT_SIZE
        Rails.logger.warn "EmailService: PDF too large for FormFill ##{form_fill.id}: #{pdf_size} bytes"
        return Result.new(
          success: false,
          message: "PDF file is too large for email attachment (#{(pdf_size / 1.megabyte).round(1)}MB). Maximum size is #{MAX_ATTACHMENT_SIZE / 1.megabyte}MB.",
          error_code: ERROR_CODES[:attachment_too_large]
        )
      end

      Result.new(success: true, message: 'PDF size validation passed')
    end

    # Validate customer email availability and format
    # @param form_fill [FormFill] The form fill containing customer data
    # @param recipient_email [String, nil] Optional recipient email override
    # @return [Result] Validation result
    def validate_customer_email(form_fill, recipient_email = nil)
      customer = form_fill.inspection.property.customer
      email_to_validate = recipient_email.presence || customer.email

      # Check if email is present
      if email_to_validate.blank?
        Rails.logger.warn "EmailService: No email available for customer #{customer.name} (FormFill ##{form_fill.id})"
        return Result.new(
          success: false,
          message: 'Customer email address is not available. Please update customer information.',
          error_code: ERROR_CODES[:customer_email_missing]
        )
      end

      # Validate email format
      unless valid_email_format?(email_to_validate)
        Rails.logger.warn "EmailService: Invalid email format '#{email_to_validate}' for FormFill ##{form_fill.id}"
        return Result.new(
          success: false,
          message: 'Customer email address format is invalid. Please update customer information.',
          error_code: ERROR_CODES[:invalid_email_format]
        )
      end

      Result.new(success: true, message: 'Email validation passed')
    end

    # Validate email format using a simple regex
    # @param email [String] Email to validate
    # @return [Boolean] True if email format is valid
    def valid_email_format?(email)
      # Simple email validation regex - more strict to avoid consecutive dots
      email_regex = /\A[\w+\-.]+@[a-z\d-]+(\.[a-z\d-]+)*\.[a-z]+\z/i
      return false if email.include?('..') # Reject consecutive dots

      email.match?(email_regex)
    end
  end
end
