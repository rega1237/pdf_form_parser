require "test_helper"

class PropertyTest < ActiveSupport::TestCase
  setup do
    @property = properties(:one)
  end

  test "should belong to customer" do
    assert_instance_of Customer, @property.customer
  end

  test "should have many inspections" do
    assert_respond_to @property, :inspections
  end

  test "destroying property should destroy associated inspections" do
    # inspections(:one) already belongs to properties(:one) via fixtures
    assert @property.inspections.include?(inspections(:one))
    
    assert_difference("Inspection.count", -1) do
      @property.destroy
    end
  end
end
