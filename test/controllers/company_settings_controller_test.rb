require "test_helper"

class CompanySettingsControllerTest < ActionDispatch::IntegrationTest
  include Devise::Test::IntegrationHelpers

  setup do
    @user = users(:one)
    sign_in @user
    
    # Ensure role is Developer for Pundit
    @dev_role = Role.find_or_create_by!(level: 'Developer')
    @user.update!(role: @dev_role)
  end

  test "should get index" do
    get settings_url
    assert_response :success
  end
end
