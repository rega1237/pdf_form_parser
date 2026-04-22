require "test_helper"

class RoleTest < ActiveSupport::TestCase
  test "should be valid with level" do
    role = Role.new(level: "Manager")
    assert role.valid?
  end

  test "should be invalid without level" do
    role = Role.new(level: nil)
    assert_not role.valid?
    assert_includes role.errors[:level], "can't be blank"
  end

  test "should be invalid with duplicate level" do
    Role.create!(level: "Manager")
    duplicate_role = Role.new(level: "Manager")
    assert_not duplicate_role.valid?
    assert_includes duplicate_role.errors[:level], "has already been taken"
  end
end
