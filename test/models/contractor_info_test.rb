require "test_helper"

class ContractorInfoTest < ActiveSupport::TestCase
  test "should be valid with name" do
    contractor = ContractorInfo.new(name: "Big City Contractor")
    assert contractor.valid?
  end

  test "should be invalid without name" do
    contractor = ContractorInfo.new(name: nil)
    assert_not contractor.valid?
    assert_includes contractor.errors[:name], "can't be blank"
  end
end
