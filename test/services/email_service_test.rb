require "test_helper"

class EmailServiceTest < ActiveSupport::TestCase
  def setup
    # Create test data manually to avoid fixture dependencies
    @customer = Customer.create!(
      name: "Test Customer",
      email: "test@example.com",
      customer_type: "Individual",
      address: "123 Test St",
      city_state_zip: "Test City, ST 12345"
    )

    @property = Property.create!(
      customer: @customer,
      property_name: "Test Property",
      property_type: "Commercial",
      address: "123 Property Ave",
      city: "Test City",
      zip_code: "12345"
    )

    @user = User.create!(
      email: "inspector@example.com",
      name: "Test Inspector",
      password: "password123"
    )

    # Create FormTemplate with attachment
    @form_template = FormTemplate.new(
      name: "Test Template",
      original_filename: "test.pdf",
      file_type: "pdf"
    )

    # Attach a mock PDF file to satisfy validation
    template_content = "%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n"
    @form_template.original_file.attach(
      io: StringIO.new(template_content),
      filename: "test_template.pdf",
      content_type: "application/pdf"
    )
    @form_template.save!

    @inspection = Inspection.create!(
      property: @property,
      form_template: @form_template,
      user: @user,
      date: Date.current
    )

    # Create form fill with PDF
    @form_fill_with_pdf = FormFill.create!(
      name: "Test Form Fill",
      form_template: @form_template,
      inspection: @inspection,
      pdf_generation_status: "completed"
    )

    # Attach a mock PDF
    pdf_content = "%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n"
    @form_fill_with_pdf.filled_pdf.attach(
      io: StringIO.new(pdf_content),
      filename: "test_inspection.pdf",
      content_type: "application/pdf"
    )

    # Create form fill without PDF
    @form_fill_without_pdf = FormFill.create!(
      name: "Test Form Fill No PDF",
      form_template: @form_template,
      inspection: @inspection,
      pdf_generation_status: "ready"
    )
  end

  test "should successfully send email with valid form fill and PDF" do
    # Mock the mailer to avoid actual email sending
    original_method = InspectionMailer.method(:send_inspection_pdf)

    mock_mailer = Object.new
    def mock_mailer.deliver_now
      true
    end

    InspectionMailer.define_singleton_method(:send_inspection_pdf) do |*args|
      mock_mailer
    end

    begin
      result = EmailService.send_inspection_pdf(@form_fill_with_pdf)

      assert result.success?
      assert_includes result.message, "Email sent successfully"
      assert_nil result.error_code
    ensure
      # Restore original method
      InspectionMailer.define_singleton_method(:send_inspection_pdf, original_method)
    end
  end

  test "should fail when PDF is not available" do
    result = EmailService.send_inspection_pdf(@form_fill_without_pdf)

    assert result.failure?
    assert_equal "PDF is not available. Please generate the PDF first.", result.message
    assert_equal EmailService::ERROR_CODES[:pdf_not_available], result.error_code
  end

  test "should fail when customer email is missing" do
    # Create customer without email
    customer_no_email = Customer.create!(
      name: "Customer No Email",
      email: "",
      customer_type: "Individual",
      address: "123 No Email St",
      city_state_zip: "Test City, ST 12345"
    )

    property_no_email = Property.create!(
      customer: customer_no_email,
      property_name: "Property No Email",
      property_type: "Commercial",
      address: "123 Property Ave",
      city: "Test City",
      zip_code: "12345"
    )

    inspection_no_email = Inspection.create!(
      property: property_no_email,
      form_template: @form_template,
      user: @user,
      date: Date.current
    )

    form_fill_no_email = FormFill.create!(
      name: "Test Form Fill No Email",
      form_template: @form_template,
      inspection: inspection_no_email,
      pdf_generation_status: "completed"
    )

    # Attach PDF
    pdf_content = "%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n"
    form_fill_no_email.filled_pdf.attach(
      io: StringIO.new(pdf_content),
      filename: "test_inspection.pdf",
      content_type: "application/pdf"
    )

    result = EmailService.send_inspection_pdf(form_fill_no_email)

    assert result.failure?
    assert_includes result.message, "Customer email address is not available"
    assert_equal EmailService::ERROR_CODES[:customer_email_missing], result.error_code
  end

  test "should fail when customer email format is invalid" do
    # Create customer with invalid email
    customer_invalid_email = Customer.create!(
      name: "Customer Invalid Email",
      email: "invalid-email-format",
      customer_type: "Individual",
      address: "123 Invalid St",
      city_state_zip: "Test City, ST 12345"
    )

    property_invalid_email = Property.create!(
      customer: customer_invalid_email,
      property_name: "Property Invalid Email",
      property_type: "Commercial",
      address: "123 Property Ave",
      city: "Test City",
      zip_code: "12345"
    )

    inspection_invalid_email = Inspection.create!(
      property: property_invalid_email,
      form_template: @form_template,
      user: @user,
      date: Date.current
    )

    form_fill_invalid_email = FormFill.create!(
      name: "Test Form Fill Invalid Email",
      form_template: @form_template,
      inspection: inspection_invalid_email,
      pdf_generation_status: "completed"
    )

    # Attach PDF
    pdf_content = "%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n"
    form_fill_invalid_email.filled_pdf.attach(
      io: StringIO.new(pdf_content),
      filename: "test_inspection.pdf",
      content_type: "application/pdf"
    )

    result = EmailService.send_inspection_pdf(form_fill_invalid_email)

    assert result.failure?
    assert_includes result.message, "One or more email addresses are invalid"
    assert_equal EmailService::ERROR_CODES[:invalid_email_format], result.error_code
  end

  test "should validate email format correctly" do
    valid_emails = [
      "test@example.com",
      "user.name@domain.co.uk",
      "user+tag@example.org",
      "123@example.com"
    ]

    invalid_emails = [
      "invalid-email",
      "@example.com",
      "test@",
      ""
    ]

    valid_emails.each do |email|
      assert EmailService.send(:valid_email_format?, email), "#{email} should be valid"
    end

    invalid_emails.each do |email|
      assert_not EmailService.send(:valid_email_format?, email), "#{email} should be invalid"
    end
  end

  test "should return Result object with correct structure" do
    result = EmailService.send_inspection_pdf(@form_fill_without_pdf)

    # Verify Result structure
    assert_respond_to result, :success?
    assert_respond_to result, :failure?
    assert_respond_to result, :message
    assert_respond_to result, :error_code

    # Verify failure result
    assert result.failure?
    assert_not result.success?
    assert_not_nil result.message
    assert_not_nil result.error_code
  end

  test "should handle nil form_fill gracefully" do
    result = EmailService.send_inspection_pdf(nil)

    assert result.failure?
    assert_includes result.message, "Invalid inspection data"
    assert_equal EmailService::ERROR_CODES[:unknown_error], result.error_code
  end
end
