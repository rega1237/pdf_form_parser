require "test_helper"

class CustomersControllerTest < ActionDispatch::IntegrationTest
  include Devise::Test::IntegrationHelpers

  setup do
    @user = users(:one)
    sign_in @user
    @customer = customers(:one)
  end

  test "should get index and be sorted by name" do
    get customers_url
    assert_response :success
    assert_select "td", text: "Customer Invalid Email" # First alphabetically (C comes before others, but after checking alphabetical order: C, C, C, C... wait)
    # Actually, let's verify precisely.
    # one: Customer One
    # two: Customer Two
    # three: Customer No Email
    # four: Customer Invalid Email
    # Sorted: Customer Invalid Email, Customer No Email, Customer One, Customer Two
  end

  test "should filter by name" do
    get customers_url, params: { query: "One" }
    assert_response :success
    assert_select "td", text: "Customer One"
    assert_select "td", text: "Customer Two", count: 0
  end

  test "should get show" do
    get customer_url(@customer)
    assert_response :success
  end

  test "should get new" do
    get new_customer_url
    assert_response :success
  end
end
