require "test_helper"

class InspectionsControllerTest < ActionDispatch::IntegrationTest
  include Devise::Test::IntegrationHelpers

  setup do
    @user = users(:one)
    sign_in @user
    @inspection = inspections(:one)
    @property = properties(:one)

    # Ensure role levels are correct for policies
    @dev_role = Role.find_or_create_by!(level: "Developer")
    @user.update!(role: @dev_role)

    # Required templates for creation
    pdf_path = Rails.root.join("test", "fixtures", "files", "test.pdf")

    # Create Interval Category and System Category for the main template
    @annual = interval_categories(:two)

    # Create a template that matches the creation criteria
    @main_template = FormTemplate.find_or_create_by!(name: "Main Template") do |t|
      t.form_structure = "[]"
      t.system_category = "Fire Alarm"
      t.original_file.attach(io: File.open(pdf_path), filename: "test.pdf", content_type: "application/pdf")
    end
    @main_template.interval_categories << @annual unless @main_template.interval_categories.include?(@annual)

    FormTemplate.find_or_create_by!(name: "Deficiencies") do |t|
      t.form_structure = "[]"
      t.system_category = "Fire Alarm"
      t.original_file.attach(io: File.open(pdf_path), filename: "test.pdf", content_type: "application/pdf")
    end
    FormTemplate.find_or_create_by!(name: "Additional Risers") do |t|
      t.form_structure = "[]"
      t.system_category = "Fire Sprinkler"
      t.original_file.attach(io: File.open(pdf_path), filename: "test.pdf", content_type: "application/pdf")
    end
    FormTemplate.find_or_create_by!(name: "Corrected Deficiencies") do |t|
      t.form_structure = "[]"
      t.system_category = "Fire Sprinkler"
      t.original_file.attach(io: File.open(pdf_path), filename: "test.pdf", content_type: "application/pdf")
    end
  end

  test "should get index" do
    get inspections_url
    assert_response :success
  end

  test "should get show" do
    get inspection_url(@inspection)
    assert_response :success
  end

  test "should get new" do
    get new_inspection_url
    assert_response :success
  end

  test "should get edit" do
    get edit_inspection_url(@inspection)
    assert_response :success
  end

  test "should create inspection" do
    assert_difference("Inspection.count") do
      post inspections_url, params: {
        inspection: {
          date: Date.current,
          property_id: @property.id,
          status: "pending",
          system_category: "Fire Alarm",
          interval_category: "Annual",
          user_id: @user.id
        }
      }
    end
    assert_redirected_to inspection_url(Inspection.last)
  end

  test "should update inspection" do
    patch inspection_url(@inspection), params: { inspection: { notes: "Updated notes" } }
    assert_redirected_to inspection_url(@inspection)
    @inspection.reload
    assert_equal "Updated notes", @inspection.notes
  end

  test "should update status" do
    patch update_status_inspection_url(@inspection), params: { status: "completed" }
    assert_redirected_to inspection_url(@inspection)
    @inspection.reload
    assert_equal "completed", @inspection.status
  end

  test "should destroy inspection" do
    assert_difference("Inspection.count", -1) do
      delete inspection_url(@inspection)
    end
    assert_redirected_to inspections_url
  end

  test "should get calendar" do
    get calendar_inspections_url
    assert_response :success
  end


  test "should get by_property" do
    get property_inspections_url(@property)
    assert_response :success
  end

  test "should get properties_by_customer" do
    get properties_by_customer_inspections_url(customer_id: @property.customer_id)
    assert_response :success
    assert_includes response.body, @property.property_name
  end
end
