require "test_helper"

class IntervalCategoryTest < ActiveSupport::TestCase
  setup do
    @category = IntervalCategory.new(name: "Monthly")
  end

  test "should be valid" do
    assert @category.valid?
  end

  test "should require a name" do
    @category.name = ""
    assert_not @category.valid?
  end

  test "name should be unique" do
    @category.save!
    duplicate = IntervalCategory.new(name: "Monthly")
    assert_not duplicate.valid?
  end

  test "effective_duration should return duration_in_months if present" do
    @category.duration_in_months = 5
    assert_equal 5, @category.effective_duration
  end

  test "effective_duration should infer from name if duration_in_months is blank" do
    @category.duration_in_months = nil

    @category.name = "Weekly"
    assert_equal 0, @category.effective_duration

    @category.name = "Monthly"
    assert_equal 1, @category.effective_duration

    @category.name = "Quarterly"
    assert_equal 3, @category.effective_duration

    @category.name = "Annual"
    assert_equal 12, @category.effective_duration

    @category.name = "5 Year"
    assert_equal 60, @category.effective_duration
  end

  test "effective_duration should return nil for unknown names" do
    @category.name = "Unknown"
    assert_nil @category.effective_duration
  end
end
