require "test_helper"

class ContractorInfoPolicyTest < ActiveSupport::TestCase
  setup do
    @admin_role = Role.find_or_create_by!(level: "Admin")
    @dev_role = Role.find_or_create_by!(level: "Developer")
    @tech_role = Role.find_or_create_by!(level: "Technician")

    @admin = User.create!(email: "admin_ci_policy@test.com", password: "password", role: @admin_role)
    @developer = User.create!(email: "dev_ci_policy@test.com", password: "password", role: @dev_role)
    @technician = User.create!(email: "tech_ci_policy@test.com", password: "password", role: @tech_role)

    @contractor_info = contractor_infos(:one)
  end

  def test_create
    refute ContractorInfoPolicy.new(@admin, ContractorInfo).create?
    assert ContractorInfoPolicy.new(@developer, ContractorInfo).create?
    refute ContractorInfoPolicy.new(@technician, ContractorInfo).create?
  end

  def test_update
    refute ContractorInfoPolicy.new(@admin, @contractor_info).update?
    assert ContractorInfoPolicy.new(@developer, @contractor_info).update?
    refute ContractorInfoPolicy.new(@technician, @contractor_info).update?
  end

  def test_destroy
    refute ContractorInfoPolicy.new(@admin, @contractor_info).destroy?
    assert ContractorInfoPolicy.new(@developer, @contractor_info).destroy?
    refute ContractorInfoPolicy.new(@technician, @contractor_info).destroy?
  end
end
