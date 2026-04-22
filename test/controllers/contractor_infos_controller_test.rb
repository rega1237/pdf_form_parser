require "test_helper"

class ContractorInfosControllerTest < ActionDispatch::IntegrationTest
  include Devise::Test::IntegrationHelpers

  setup do
    @contractor_info = contractor_infos(:one)
    @user = users(:one)
    sign_in @user
  end

  test "should get new" do
    get new_contractor_info_url
    assert_response :success
  end

  test "should create contractor_info" do
    assert_difference("ContractorInfo.count") do
      post contractor_infos_url, params: { contractor_info: {
        name: "Acme Corp",
        address: "123 Main St",
        city: "Springfield",
        state: "IL",
        zip: "62704",
        phone: "555-0199"
      } }
    end

    assert_redirected_to settings_path
  end

  test "should get edit" do
    get edit_contractor_info_url(@contractor_info)
    assert_response :success
  end

  test "should update contractor_info" do
    patch contractor_info_url(@contractor_info), params: { contractor_info: { name: "Updated Contractor" } }
    assert_redirected_to settings_path
    @contractor_info.reload
    assert_equal "Updated Contractor", @contractor_info.name
  end

  test "should destroy contractor_info" do
    assert_difference("ContractorInfo.count", -1) do
      delete contractor_info_url(@contractor_info)
    end

    # Note: ContractorInfosController#destroy currently uses company_settings_path
    # which might be failing if not defined. We'll see.
    assert_redirected_to "/settings"
  end
end
