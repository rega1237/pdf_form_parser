require "test_helper"

class DeficienciesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @deficiency = deficiencies(:one)
  end

  test "should get index" do
    get deficiencies_url
    assert_response :success
  end

  test "should get new" do
    get new_deficiency_url
    assert_response :success
  end

  test "should create deficiency" do
    assert_difference("Deficiency.count") do
      post deficiencies_url, params: { deficiency: { name: @deficiency.name } }
    end

    assert_redirected_to deficiency_url(Deficiency.last)
  end

  test "should show deficiency" do
    get deficiency_url(@deficiency)
    assert_response :success
  end

  test "should get edit" do
    get edit_deficiency_url(@deficiency)
    assert_response :success
  end

  test "should update deficiency" do
    patch deficiency_url(@deficiency), params: { deficiency: { name: @deficiency.name } }
    assert_redirected_to deficiency_url(@deficiency)
  end

  test "should destroy deficiency" do
    assert_difference("Deficiency.count", -1) do
      delete deficiency_url(@deficiency)
    end

    assert_redirected_to deficiencies_url
  end
end
