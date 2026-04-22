require "test_helper"

class DeficiencyTest < ActiveSupport::TestCase
  setup do
    @deficiency = Deficiency.new(name: "New Unique Deficiency")
  end

  test "should be valid" do
    assert @deficiency.valid?
  end

  test "should require a name" do
    @deficiency.name = ""
    assert_not @deficiency.valid?
  end

  test "name should be unique" do
    @deficiency.save!
    duplicate_deficiency = Deficiency.new(name: @deficiency.name)
    assert_not duplicate_deficiency.valid?
  end

  test "name uniqueness should be case insensitive" do
    @deficiency.save!
    duplicate_deficiency = Deficiency.new(name: @deficiency.name.upcase)
    assert_not duplicate_deficiency.valid?
  end
end
