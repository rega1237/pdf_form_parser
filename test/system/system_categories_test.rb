require "application_system_test_case"

class SystemCategoriesTest < ApplicationSystemTestCase
  setup do
    @system_category = system_categories(:one)
  end

  test "visiting the index" do
    visit system_categories_url
    assert_selector "h1", text: "System categories"
  end

  test "should create system category" do
    visit system_categories_url
    click_on "New system category"

    fill_in "Name", with: @system_category.name
    click_on "Create System category"

    assert_text "System category was successfully created"
    click_on "Back"
  end

  test "should update System category" do
    visit system_category_url(@system_category)
    click_on "Edit this system category", match: :first

    fill_in "Name", with: @system_category.name
    click_on "Update System category"

    assert_text "System category was successfully updated"
    click_on "Back"
  end

  test "should destroy System category" do
    visit system_category_url(@system_category)
    accept_confirm { click_on "Destroy this system category", match: :first }

    assert_text "System category was successfully destroyed"
  end
end
