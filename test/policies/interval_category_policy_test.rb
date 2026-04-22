require "test_helper"

class IntervalCategoryPolicyTest < ActiveSupport::TestCase
  setup do
    @admin_role = Role.find_or_create_by!(level: "Admin")
    @dev_role = Role.find_or_create_by!(level: "Developer")
    @tech_role = Role.find_or_create_by!(level: "Technician")

    @admin = User.create!(email: "admin_ic_policy@test.com", password: "password", role: @admin_role)
    @developer = User.create!(email: "dev_ic_policy@test.com", password: "password", role: @dev_role)
    @technician = User.create!(email: "tech_ic_policy@test.com", password: "password", role: @tech_role)

    @interval_category = interval_categories(:one)
  end

  def test_index
    refute IntervalCategoryPolicy.new(@admin, IntervalCategory).index?
    assert IntervalCategoryPolicy.new(@developer, IntervalCategory).index?
    refute IntervalCategoryPolicy.new(@technician, IntervalCategory).index?
  end

  def test_show
    refute IntervalCategoryPolicy.new(@admin, @interval_category).show?
    assert IntervalCategoryPolicy.new(@developer, @interval_category).show?
    refute IntervalCategoryPolicy.new(@technician, @interval_category).show?
  end

  def test_create
    refute IntervalCategoryPolicy.new(@admin, IntervalCategory).create?
    assert IntervalCategoryPolicy.new(@developer, IntervalCategory).create?
    refute IntervalCategoryPolicy.new(@technician, IntervalCategory).create?
  end

  def test_update
    refute IntervalCategoryPolicy.new(@admin, @interval_category).update?
    assert IntervalCategoryPolicy.new(@developer, @interval_category).update?
    refute IntervalCategoryPolicy.new(@technician, @interval_category).update?
  end

  def test_destroy
    refute IntervalCategoryPolicy.new(@admin, @interval_category).destroy?
    assert IntervalCategoryPolicy.new(@developer, @interval_category).destroy?
    refute IntervalCategoryPolicy.new(@technician, @interval_category).destroy?
  end
end
