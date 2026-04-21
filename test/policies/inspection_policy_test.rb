require 'test_helper'

class InspectionPolicyTest < ActiveSupport::TestCase
  setup do
    @admin_role = roles(:admin)
    @dev_role = roles(:developer)
    @tech_role = Role.find_or_create_by!(level: 'Technician')

    @admin = User.create!(email: 'admin_policy@test.com', password: 'password', role: @admin_role)
    @developer = User.create!(email: 'dev_policy@test.com', password: 'password', role: @dev_role)
    @technician = User.create!(email: 'tech_policy@test.com', password: 'password', role: @tech_role)
    @other_tech = User.create!(email: 'other_policy@test.com', password: 'password', role: @tech_role)

    @inspection = inspections(:one)
    @inspection.update!(user: @technician)
  end

  def test_scope
    # Admin should see all
    assert_includes InspectionPolicy::Scope.new(@admin, Inspection.all).resolve, @inspection
    
    # Developer should see all
    assert_includes InspectionPolicy::Scope.new(@developer, Inspection.all).resolve, @inspection
    
    # Technician should only see their own
    scope = InspectionPolicy::Scope.new(@technician, Inspection.all).resolve
    assert_includes scope, @inspection
    
    # Other technician should not see it
    scope = InspectionPolicy::Scope.new(@other_tech, Inspection.all).resolve
    refute_includes scope, @inspection
  end

  def test_show
    assert InspectionPolicy.new(@admin, @inspection).show?
    assert InspectionPolicy.new(@developer, @inspection).show?
    assert InspectionPolicy.new(@technician, @inspection).show?
    refute InspectionPolicy.new(@other_tech, @inspection).show?
  end

  def test_create
    assert InspectionPolicy.new(@admin, @inspection).create?
    assert InspectionPolicy.new(@developer, @inspection).create?
    refute InspectionPolicy.new(@technician, @inspection).create?
  end

  def test_update
    assert InspectionPolicy.new(@admin, @inspection).update?
    assert InspectionPolicy.new(@developer, @inspection).update?
    refute InspectionPolicy.new(@technician, @inspection).update?
  end

  def test_destroy
    assert InspectionPolicy.new(@admin, @inspection).destroy?
    assert InspectionPolicy.new(@developer, @inspection).destroy?
    refute InspectionPolicy.new(@technician, @inspection).destroy?
  end

  def test_update_status
    assert InspectionPolicy.new(@admin, @inspection).update_status?
    assert InspectionPolicy.new(@developer, @inspection).update_status?
    assert InspectionPolicy.new(@technician, @inspection).update_status?
    refute InspectionPolicy.new(@other_tech, @inspection).update_status?
  end

  def test_calendar
    assert InspectionPolicy.new(@technician, @inspection).calendar?
    assert InspectionPolicy.new(@admin, @inspection).calendar?
  end
end
