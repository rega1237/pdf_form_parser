require 'test_helper'

class PropertyPolicyTest < ActiveSupport::TestCase
  setup do
    @admin_role = Role.find_or_create_by!(level: 'Admin')
    @dev_role = Role.find_or_create_by!(level: 'Developer')
    @tech_role = Role.find_or_create_by!(level: 'Technician')

    @admin = User.create!(email: 'admin_prop_policy@test.com', password: 'password', role: @admin_role)
    @developer = User.create!(email: 'dev_prop_policy@test.com', password: 'password', role: @dev_role)
    @technician = User.create!(email: 'tech_prop_policy@test.com', password: 'password', role: @tech_role)

    @property = properties(:one)
  end

  def test_index
    assert PropertyPolicy.new(@admin, Property).index?
    assert PropertyPolicy.new(@developer, Property).index?
    refute PropertyPolicy.new(@technician, Property).index?
  end

  def test_show
    assert PropertyPolicy.new(@admin, @property).show?
    assert PropertyPolicy.new(@developer, @property).show?
    refute PropertyPolicy.new(@technician, @property).show?
  end

  def test_create
    assert PropertyPolicy.new(@admin, Property).create?
    assert PropertyPolicy.new(@developer, Property).create?
    refute PropertyPolicy.new(@technician, Property).create?
  end

  def test_update
    assert PropertyPolicy.new(@admin, @property).update?
    assert PropertyPolicy.new(@developer, @property).update?
    refute PropertyPolicy.new(@technician, @property).update?
  end

  def test_destroy
    assert PropertyPolicy.new(@admin, @property).destroy?
    assert PropertyPolicy.new(@developer, @property).destroy?
    refute PropertyPolicy.new(@technician, @property).destroy?
  end

  def test_scope
    # Admin/Developer should see all
    assert_includes PropertyPolicy::Scope.new(@admin, Property.all).resolve, @property
    assert_includes PropertyPolicy::Scope.new(@developer, Property.all).resolve, @property
    
    # Technician should see none
    refute_includes PropertyPolicy::Scope.new(@technician, Property.all).resolve, @property
  end
end
