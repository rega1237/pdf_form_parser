require "test_helper"

class IntervalCategoriesControllerTest < ActionDispatch::IntegrationTest
  include Devise::Test::IntegrationHelpers

  setup do
    @interval_category = interval_categories(:one)
    @user = users(:one)
    sign_in @user
  end


  test "should get new" do
    get new_interval_category_url
    assert_response :success
  end

  test "should create interval_category" do
    assert_difference("IntervalCategory.count") do
      post interval_categories_url, params: { interval_category: { name: "Monthly" } }
    end

    assert_redirected_to settings_path
  end


  test "should get edit" do
    get edit_interval_category_url(@interval_category)
    assert_response :success
  end

  test "should update interval_category" do
    patch interval_category_url(@interval_category), params: { interval_category: { name: "Quarterly Updated" } }
    assert_redirected_to settings_path
    @interval_category.reload
    assert_equal "Quarterly Updated", @interval_category.name
  end

  test "should destroy interval_category" do
    assert_difference("IntervalCategory.count", -1) do
      delete interval_category_url(@interval_category)
    end

    assert_redirected_to settings_path
  end
end
