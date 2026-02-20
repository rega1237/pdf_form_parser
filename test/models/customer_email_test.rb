require "test_helper"

class CustomerEmailTest < ActiveSupport::TestCase
  test "should allow valid email with a customer" do
    customer = customers(:one)
    customer_email = CustomerEmail.new(customer: customer, address: "test@example.com", primary: true)
    assert customer_email.valid?
  end

  test "should require an address" do
    customer_email = CustomerEmail.new(customer: customers(:one), primary: true)
    assert_not customer_email.valid?
    assert_includes customer_email.errors[:address], "can't be blank"
  end

  test "should require a valid email format" do
    customer_email = CustomerEmail.new(customer: customers(:one), address: "invalid-email")
    assert_not customer_email.valid?
    assert_includes customer_email.errors[:address], "is invalid"
  end
end
