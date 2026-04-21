require "test_helper"

class FormTemplatesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @form_template = form_templates(:one)
    @form_template.original_file.attach(
      io: File.open(Rails.root.join('test', 'fixtures', 'files', 'test.pdf')),
      filename: 'test.pdf',
      content_type: 'application/pdf'
    )
    sign_in users(:one)
  end

  test "should get index" do
    get form_templates_url
    assert_response :success
  end

  test "should get new" do
    get new_form_template_url
    assert_response :success
  end

  test "should create form_template" do
    # Assuming there's a POST create route
    assert_difference("FormTemplate.count") do
      post form_templates_url, params: { 
        form_template: { 
          name: "New Template",
          original_file: fixture_file_upload("test.pdf", "application/pdf")
        } 
      }
    end
    assert_redirected_to form_template_url(FormTemplate.last)
  end

  test "should show form_template" do
    get form_template_url(@form_template)
    assert_response :success
  end

  test "should destroy form_template" do
    @form_template.inspections.destroy_all
    assert_difference("FormTemplate.count", -1) do
      delete form_template_url(@form_template)
    end
    assert_redirected_to form_templates_url
  end
end
