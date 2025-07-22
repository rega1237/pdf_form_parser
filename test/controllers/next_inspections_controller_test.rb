require "test_helper"

class NextInspectionsControllerTest < ActionDispatch::IntegrationTest
  test "should get index" do
    get next_inspections_index_url
    assert_response :success
  end

  test "should get show" do
    get next_inspections_show_url
    assert_response :success
  end
end
