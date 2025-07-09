require "test_helper"

class SystemCategoriesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @system_category = system_categories(:one)
  end

  test "should get index" do
    get system_categories_url
    assert_response :success
  end

  test "should get new" do
    get new_system_category_url
    assert_response :success
  end

  test "should create system_category" do
    assert_difference("SystemCategory.count") do
      post system_categories_url, params: { system_category: { name: @system_category.name } }
    end

    assert_redirected_to system_category_url(SystemCategory.last)
  end

  test "should show system_category" do
    get system_category_url(@system_category)
    assert_response :success
  end

  test "should get edit" do
    get edit_system_category_url(@system_category)
    assert_response :success
  end

  test "should update system_category" do
    patch system_category_url(@system_category), params: { system_category: { name: @system_category.name } }
    assert_redirected_to system_category_url(@system_category)
  end

  test "should destroy system_category" do
    assert_difference("SystemCategory.count", -1) do
      delete system_category_url(@system_category)
    end

    assert_redirected_to system_categories_url
  end
end
