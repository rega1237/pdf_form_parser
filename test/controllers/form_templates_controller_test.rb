require "test_helper"

class FormTemplatesControllerTest < ActionDispatch::IntegrationTest
  test "should get index" do
    get form_templates_index_url
    assert_response :success
  end

  test "should get new" do
    get form_templates_new_url
    assert_response :success
  end

  test "should get create" do
    get form_templates_create_url
    assert_response :success
  end

  test "should get show" do
    get form_templates_show_url
    assert_response :success
  end

  test "should get destroy" do
    get form_templates_destroy_url
    assert_response :success
  end
end
