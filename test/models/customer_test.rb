require "test_helper"

class CustomerTest < ActiveSupport::TestCase
  test "has many customer_emails" do
    customer = customers(:one)
    assert_respond_to customer, :customer_emails
  end

  test "returns primary email or first email if primary not set" do
    customer = customers(:one)
    customer.update!(email: nil)
    assert_nil customer.email

    email1 = customer.customer_emails.create!(address: "first@example.com", primary: false)
    assert_equal "first@example.com", customer.email

    email2 = customer.customer_emails.create!(address: "second@example.com", primary: true)

    # Reload customer to ensure associations are fresh, though it might hit database
    assert_equal "second@example.com", customer.reload.email
  end
end
