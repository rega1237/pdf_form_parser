require "test_helper"

class LicenseInfoTest < ActiveSupport::TestCase
  test "should be valid with license number" do
    license = LicenseInfo.new(license_number: "C12345")
    assert license.valid?
  end

  test "should be invalid without license number" do
    license = LicenseInfo.new(license_number: nil)
    assert_not license.valid?
    assert_includes license.errors[:license_number], "can't be blank"
  end
end
