require "application_system_test_case"

class DeficienciesTest < ApplicationSystemTestCase
  setup do
    @deficiency = deficiencies(:one)
  end

  test "visiting the index" do
    visit deficiencies_url
    assert_selector "h1", text: "Deficiencies"
  end

  test "should create deficiency" do
    visit deficiencies_url
    click_on "New deficiency"

    fill_in "Name", with: @deficiency.name
    click_on "Create Deficiency"

    assert_text "Deficiency was successfully created"
    click_on "Back"
  end

  test "should update Deficiency" do
    visit deficiency_url(@deficiency)
    click_on "Edit this deficiency", match: :first

    fill_in "Name", with: @deficiency.name
    click_on "Update Deficiency"

    assert_text "Deficiency was successfully updated"
    click_on "Back"
  end

  test "should destroy Deficiency" do
    visit deficiency_url(@deficiency)
    accept_confirm { click_on "Destroy this deficiency", match: :first }

    assert_text "Deficiency was successfully destroyed"
  end
end
