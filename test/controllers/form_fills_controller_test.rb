require "test_helper"

class FormFillsControllerTest < ActionDispatch::IntegrationTest
  include Devise::Test::IntegrationHelpers

  setup do
    @user = users(:one)
    sign_in @user
    @form_fill = form_fills(:one)
  end

  test "should show form_fill with email button when conditions are met" do
    # Ensure the form_fill has the required associations and PDF
    @form_fill.update!(pdf_generation_status: "completed")

    # Mock PDF attachment
    pdf_content = "fake pdf content"
    @form_fill.filled_pdf.attach(
      io: StringIO.new(pdf_content),
      filename: "test.pdf",
      content_type: "application/pdf"
    )

    get form_fill_url(@form_fill)
    assert_response :success

    # Check that the Send Email button is present (text check)
    assert_select "button", text: /Send Email/
  end

  test "should show disabled email button when PDF not available" do
    # Ensure no PDF is attached and set status to ready (not completed)
    @form_fill.filled_pdf.purge if @form_fill.filled_pdf.attached?
    @form_fill.update!(pdf_generation_status: "ready")

    get form_fill_url(@form_fill)
    assert_response :success

    # Should show disabled state with PDF Required message
    assert_includes response.body, "PDF Required"
  end

  test "should show disabled email button when customer email not available" do
    # Use form_fill with customer that has no email (customer three)
    @form_fill_no_email = form_fills(:one)
    @form_fill_no_email.inspection.property.update!(customer: customers(:three))
    @form_fill_no_email.update!(pdf_generation_status: "completed")

    # Mock PDF attachment
    pdf_content = "fake pdf content"
    @form_fill_no_email.filled_pdf.attach(
      io: StringIO.new(pdf_content),
      filename: "test.pdf",
      content_type: "application/pdf"
    )

    get form_fill_url(@form_fill_no_email)
    assert_response :success

    # Should show disabled state with Email Unavailable message
    assert_includes response.body, "Email Unavailable"
  end
end
