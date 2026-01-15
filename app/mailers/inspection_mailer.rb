class InspectionMailer < ApplicationMailer
  def send_inspection_pdf(form_fill_id, recipient_email = nil, subject = nil, body = nil)
    @form_fill = FormFill.find(form_fill_id)
    @inspection = @form_fill.inspection
    @property = @inspection.property
    @customer = @property.customer
    @inspector = @inspection.user
    @company_name = 'Firemex Solutions'
    @custom_body = body

    # Use provided email or fallback to customer email
    recipient = recipient_email.presence || @customer.email

    # Raise error if no recipient email available
    raise ArgumentError, 'No recipient email available' if recipient.blank?

    # Generate dynamic subject line with inspection details
    final_subject = subject.presence || "Inspection Report for #{@property.property_name} - #{@inspection.date.strftime('%B %d, %Y')}"

    # Attach PDF if available
    raise ArgumentError, 'PDF not available for attachment' unless @form_fill.filled_pdf.attached?

    # Generate descriptive filename that includes property and inspection information
    filename = generate_pdf_filename(@property, @inspection)
    attachments[filename] = @form_fill.filled_pdf.download

    mail(
      to: recipient,
      subject: final_subject,
      from: "#{@company_name} <#{ENV.fetch('MAILER_FROM_EMAIL', 'noreply@example.com')}>"
    )
  end

  private

  def generate_pdf_filename(property, inspection)
    # Sanitize property name for filename
    safe_property_name = property.property_name.gsub(/[^0-9A-Za-z.-]/, '_').downcase
    date_string = inspection.date.strftime('%m%d%Y')
    system_category = inspection.system_category
    interval_category = inspection.interval_category

    "#{safe_property_name}_inspection_#{system_category}_#{interval_category}_#{date_string}.pdf"
  end
end
