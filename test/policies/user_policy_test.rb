require "test_helper"

class UserPolicyTest < ActiveSupport::TestCase
  setup do
    @admin_role = Role.find_or_create_by!(level: "Admin")
    @dev_role = Role.find_or_create_by!(level: "Developer")
    @tech_role = Role.find_or_create_by!(level: "Technician")

    @admin = User.create!(email: "admin_user_policy@test.com", password: "password", role: @admin_role)
    @developer = User.create!(email: "dev_user_policy@test.com", password: "password", role: @dev_role)
    @technician = User.create!(email: "tech_user_policy@test.com", password: "password", role: @tech_role)
    @other_user = User.create!(email: "other_user_policy@test.com", password: "password", role: @tech_role)
  end

  def test_index
    assert UserPolicy.new(@admin, User).index?
    assert UserPolicy.new(@developer, User).index?
    refute UserPolicy.new(@technician, User).index?
  end

  def test_show
    assert UserPolicy.new(@admin, @technician).show?
    assert UserPolicy.new(@developer, @technician).show?
    assert UserPolicy.new(@technician, @technician).show?
    refute UserPolicy.new(@technician, @other_user).show?
  end

  def test_create
    assert UserPolicy.new(@admin, User).create?
    assert UserPolicy.new(@developer, User).create?
    refute UserPolicy.new(@technician, User).create?
  end

  def test_update
    assert UserPolicy.new(@admin, @technician).update?
    assert UserPolicy.new(@developer, @technician).update?
    assert UserPolicy.new(@technician, @technician).update?
    refute UserPolicy.new(@technician, @other_user).update?
  end

  def test_destroy
    assert UserPolicy.new(@admin, @technician).destroy?
    assert UserPolicy.new(@developer, @technician).destroy?
    assert UserPolicy.new(@technician, @technician).destroy?
    refute UserPolicy.new(@technician, @other_user).destroy?
  end

  def test_change_role
    refute UserPolicy.new(@admin, @technician).change_role?
    assert UserPolicy.new(@developer, @technician).change_role?
    refute UserPolicy.new(@technician, @technician).change_role?
  end

  def test_scope
    # Admin/Developer should see all
    assert_equal User.all.count, UserPolicy::Scope.new(@admin, User.all).resolve.count
    assert_equal User.all.count, UserPolicy::Scope.new(@developer, User.all).resolve.count

    # Technician should see none
    assert_equal 0, UserPolicy::Scope.new(@technician, User.all).resolve.count
  end
end
