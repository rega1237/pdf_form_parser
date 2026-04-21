require 'test_helper'

class SystemCategoryPolicyTest < ActiveSupport::TestCase
  setup do
    @admin_role = Role.find_or_create_by!(level: 'Admin')
    @dev_role = Role.find_or_create_by!(level: 'Developer')
    @tech_role = Role.find_or_create_by!(level: 'Technician')

    @admin = User.create!(email: 'admin_sc_policy@test.com', password: 'password', role: @admin_role)
    @developer = User.create!(email: 'dev_sc_policy@test.com', password: 'password', role: @dev_role)
    @technician = User.create!(email: 'tech_sc_policy@test.com', password: 'password', role: @tech_role)

    @system_category = system_categories(:one)
  end

  def test_index
    refute SystemCategoryPolicy.new(@admin, SystemCategory).index?
    assert SystemCategoryPolicy.new(@developer, SystemCategory).index?
    refute SystemCategoryPolicy.new(@technician, SystemCategory).index?
  end

  def test_show
    refute SystemCategoryPolicy.new(@admin, @system_category).show?
    assert SystemCategoryPolicy.new(@developer, @system_category).show?
    refute SystemCategoryPolicy.new(@technician, @system_category).show?
  end

  def test_create
    refute SystemCategoryPolicy.new(@admin, SystemCategory).create?
    assert SystemCategoryPolicy.new(@developer, SystemCategory).create?
    refute SystemCategoryPolicy.new(@technician, SystemCategory).create?
  end

  def test_update
    refute SystemCategoryPolicy.new(@admin, @system_category).update?
    assert SystemCategoryPolicy.new(@developer, @system_category).update?
    refute SystemCategoryPolicy.new(@technician, @system_category).update?
  end

  def test_destroy
    refute SystemCategoryPolicy.new(@admin, @system_category).destroy?
    assert SystemCategoryPolicy.new(@developer, @system_category).destroy?
    refute SystemCategoryPolicy.new(@technician, @system_category).destroy?
  end
end
