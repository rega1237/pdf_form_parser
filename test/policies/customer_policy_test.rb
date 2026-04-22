require "test_helper"

class CustomerPolicyTest < ActiveSupport::TestCase
  setup do
    @admin_role = roles(:admin)
    @dev_role = roles(:developer)
    @tech_role = Role.find_or_create_by!(level: "Technician")

    @admin = User.create!(email: "admin_cust@test.com", password: "password", role: @admin_role)
    @developer = User.create!(email: "dev_cust@test.com", password: "password", role: @dev_role)
    @technician = User.create!(email: "tech_cust@test.com", password: "password", role: @tech_role)

    @customer = customers(:one)
  end

  def test_scope
    assert_includes CustomerPolicy::Scope.new(@admin, Customer.all).resolve, @customer
    assert_includes CustomerPolicy::Scope.new(@developer, Customer.all).resolve, @customer
    refute_includes CustomerPolicy::Scope.new(@technician, Customer.all).resolve, @customer
  end

  def test_show
    assert CustomerPolicy.new(@admin, @customer).show?
    assert CustomerPolicy.new(@developer, @customer).show?
    refute CustomerPolicy.new(@technician, @customer).show?
  end

  def test_create
    assert CustomerPolicy.new(@admin, @customer).create?
    assert CustomerPolicy.new(@developer, @customer).create?
    refute CustomerPolicy.new(@technician, @customer).create?
  end

  def test_update
    assert CustomerPolicy.new(@admin, @customer).update?
    assert CustomerPolicy.new(@developer, @customer).update?
    refute CustomerPolicy.new(@technician, @customer).update?
  end

  def test_destroy
    assert CustomerPolicy.new(@admin, @customer).destroy?
    assert CustomerPolicy.new(@developer, @customer).destroy?
    refute CustomerPolicy.new(@technician, @customer).destroy?
  end
end
