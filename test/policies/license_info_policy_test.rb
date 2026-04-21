require 'test_helper'

class LicenseInfoPolicyTest < ActiveSupport::TestCase
  setup do
    @admin_role = Role.find_or_create_by!(level: 'Admin')
    @dev_role = Role.find_or_create_by!(level: 'Developer')
    @tech_role = Role.find_or_create_by!(level: 'Technician')

    @admin = User.create!(email: 'admin_li_policy@test.com', password: 'password', role: @admin_role)
    @developer = User.create!(email: 'dev_li_policy@test.com', password: 'password', role: @dev_role)
    @technician = User.create!(email: 'tech_li_policy@test.com', password: 'password', role: @tech_role)

    @license_info = license_infos(:one)
  end

  def test_create
    refute LicenseInfoPolicy.new(@admin, LicenseInfo).create?
    assert LicenseInfoPolicy.new(@developer, LicenseInfo).create?
    refute LicenseInfoPolicy.new(@technician, LicenseInfo).create?
  end

  def test_update
    refute LicenseInfoPolicy.new(@admin, @license_info).update?
    assert LicenseInfoPolicy.new(@developer, @license_info).update?
    refute LicenseInfoPolicy.new(@technician, @license_info).update?
  end

  def test_destroy
    refute LicenseInfoPolicy.new(@admin, @license_info).destroy?
    assert LicenseInfoPolicy.new(@developer, @license_info).destroy?
    refute LicenseInfoPolicy.new(@technician, @license_info).destroy?
  end
end
