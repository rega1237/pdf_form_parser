require 'test_helper'

class DeficiencyPolicyTest < ActiveSupport::TestCase
  setup do
    @admin_role = Role.find_or_create_by!(level: 'Admin')
    @dev_role = Role.find_or_create_by!(level: 'Developer')
    @tech_role = Role.find_or_create_by!(level: 'Technician')

    @admin = User.create!(email: 'admin_def_policy@test.com', password: 'password', role: @admin_role)
    @developer = User.create!(email: 'dev_def_policy@test.com', password: 'password', role: @dev_role)
    @technician = User.create!(email: 'tech_def_policy@test.com', password: 'password', role: @tech_role)

    @deficiency = deficiencies(:one)
  end

  def test_index
    refute DeficiencyPolicy.new(@admin, Deficiency).index?
    assert DeficiencyPolicy.new(@developer, Deficiency).index?
    refute DeficiencyPolicy.new(@technician, Deficiency).index?
  end

  def test_create
    refute DeficiencyPolicy.new(@admin, Deficiency).create?
    assert DeficiencyPolicy.new(@developer, Deficiency).create?
    refute DeficiencyPolicy.new(@technician, Deficiency).create?
  end

  def test_update
    refute DeficiencyPolicy.new(@admin, @deficiency).update?
    assert DeficiencyPolicy.new(@developer, @deficiency).update?
    refute DeficiencyPolicy.new(@technician, @deficiency).update?
  end

  def test_destroy
    refute DeficiencyPolicy.new(@admin, @deficiency).destroy?
    assert DeficiencyPolicy.new(@developer, @deficiency).destroy?
    refute DeficiencyPolicy.new(@technician, @deficiency).destroy?
  end
end
