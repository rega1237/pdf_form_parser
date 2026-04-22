require "test_helper"

class SystemCategoryTest < ActiveSupport::TestCase
  test "should be valid with name" do
    category = SystemCategory.new(name: "Fire Alarm")
    assert category.valid?
  end

  test "should be invalid without name" do
    category = SystemCategory.new(name: nil)
    assert_not category.valid?
    assert_includes category.errors[:name], "can't be blank"
  end
end
