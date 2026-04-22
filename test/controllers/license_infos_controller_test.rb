require "test_helper"

class LicenseInfosControllerTest < ActionDispatch::IntegrationTest
  include Devise::Test::IntegrationHelpers

  setup do
    @license_info = license_infos(:one)
    @user = users(:one)
    sign_in @user

    # Ensure role is Developer for Pundit
    @dev_role = Role.find_or_create_by!(level: "Developer")
    @user.update!(role: @dev_role)
  end

  test "should get new" do
    get new_license_info_url
    assert_response :success
  end

  test "should create license_info" do
    assert_difference("LicenseInfo.count") do
      post license_infos_url, params: {
        license_info: {
          license_number: "LIC123",
          sfm: true,
          cslb: false
        }
      }
    end

    assert_redirected_to settings_url
  end

  test "should get edit" do
    get edit_license_info_url(@license_info)
    assert_response :success
  end

  test "should update license_info" do
    patch license_info_url(@license_info), params: {
      license_info: {
        license_number: "UPDATED123"
      }
    }
    assert_redirected_to settings_url
    @license_info.reload
    assert_equal "UPDATED123", @license_info.license_number
  end

  test "should destroy license_info" do
    assert_difference("LicenseInfo.count", -1) do
      delete license_info_url(@license_info)
    end

    assert_redirected_to settings_url
  end
end
