require "test_helper"

class PropertiesControllerTest < ActionDispatch::IntegrationTest
  include Devise::Test::IntegrationHelpers

  setup do
    @user = users(:one)
    sign_in @user
    @customer = customers(:one)
    @property = properties(:one)
  end

  test "should get new" do
    get new_property_url(customer_id: @customer.id)
    assert_response :success
  end

  test "should create property" do
    assert_difference("Property.count") do
      post properties_url, params: {
        property: {
          customer_id: @customer.id,
          property_name: "New Property",
          property_type: "Residential",
          address: "123 Main St",
          city: "Springfield",
          zip_code: "62704",
          construction_type: "Wood"
        }
      }
    end

    assert_redirected_to edit_customer_url(@customer)
  end

  test "should show property" do
    get property_url(@property)
    assert_response :success
  end

  test "should get edit" do
    get edit_property_url(@property)
    assert_response :success
  end

  test "should update property" do
    patch property_url(@property), params: {
      property: { property_name: "Updated Name" }
    }
    assert_redirected_to edit_customer_url(@customer)
    @property.reload
    assert_equal "Updated Name", @property.property_name
  end

  test "should destroy property" do
    # User user1 (developer) is authorized to destroy based on PropertyPolicy
    assert_difference("Property.count", -1) do
      delete property_url(@property)
    end

    assert_redirected_to edit_customer_url(@customer)
  end
end
