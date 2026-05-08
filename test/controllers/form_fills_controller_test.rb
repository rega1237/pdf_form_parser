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

  test "should lock pdf and redirect to form fill" do
    @form_fill.update!(pdf_generation_status: "completed")

    # Attach a mock PDF
    @form_fill.filled_pdf.attach(
      io: StringIO.new("fake pdf content"),
      filename: "test.pdf",
      content_type: "application/pdf"
    )

    # Mock the PdfFlattenService
    PdfFlattenService.expects(:call).returns(true)

    post lock_pdf_form_fill_url(@form_fill)

    assert_redirected_to form_fill_url(@form_fill)
    assert_equal "PDF successfully locked.", flash[:notice]
  end

  test "should redirect with alert if pdf not attached when locking" do
    @form_fill.filled_pdf.purge if @form_fill.filled_pdf.attached?

    post lock_pdf_form_fill_url(@form_fill)

    assert_redirected_to form_fill_url(@form_fill)
    assert_equal "No PDF generated to lock.", flash[:alert]
  end

  test "should get pdf status" do
    @form_fill.update!(pdf_generation_status: "generating")

    get pdf_status_form_fill_url(@form_fill)
    assert_response :success

    json_response = JSON.parse(response.body)
    assert json_response["success"]
    assert_equal "generating", json_response["status"]
    assert_not json_response["completed"]
    assert_nil json_response["download_url"]
  end

  test "should get pdf status as completed when pdf is attached" do
    @form_fill.update!(pdf_generation_status: "completed")
    @form_fill.filled_pdf.attach(
      io: StringIO.new("fake pdf content"),
      filename: "test.pdf",
      content_type: "application/pdf"
    )

    get pdf_status_form_fill_url(@form_fill)
    assert_response :success

    json_response = JSON.parse(response.body)
    assert json_response["success"]
    assert_equal "completed", json_response["status"]
    assert json_response["completed"]
    assert_not_nil json_response["download_url"]
  end
end
