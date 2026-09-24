require "test_helper"

class Api::V1::InspectionsControllerTest < ActionDispatch::IntegrationTest
  include Devise::Test::IntegrationHelpers

  setup do
    @user = users(:one)
    sign_in @user
    @inspection = inspections(:one)
    @form_fill = form_fills(:one)
    @form_fill.update!(inspection_id: @inspection.id)

    # Ensure role level allows access
    @dev_role = Role.find_or_create_by!(level: "Developer")
    @user.update!(role: @dev_role)
  end

  test "should get offline_data only returning active photos and signatures" do
    # Attach 3 photos to the form fill in ActiveStorage
    @form_fill.photos.attach(io: StringIO.new("file1"), filename: "inspection_#{@inspection.id}_test_photo_1_abc.jpg", content_type: "image/jpeg")
    @form_fill.photos.attach(io: StringIO.new("file2"), filename: "inspection_#{@inspection.id}_test_photo_2_def.jpg", content_type: "image/jpeg")
    @form_fill.photos.attach(io: StringIO.new("file3"), filename: "inspection_#{@inspection.id}_test_sig_ghi.png", content_type: "image/png")

    @form_fill.reload
    photo_1 = @form_fill.photos.first
    photo_2 = @form_fill.photos.second
    photo_3 = @form_fill.photos.third

    # In the form fill data, we ONLY reference photo_1 and photo_3 (signature)
    # photo_2 remains orphaned/unreferenced
    @form_fill.update!(data: {
      "test_photo_1_photo_attachment_id" => ["inspection_#{@inspection.id}_test_photo_1_abc"],
      "test_sig_signature_attachment_id" => "inspection_#{@inspection.id}_test_sig_ghi"
    })

    get offline_data_api_v1_inspection_url(@inspection)
    assert_response :success

    json_response = JSON.parse(response.body)
    assert json_response["success"]
    
    serialized_form_fills = json_response["data"]["form_fills"]
    serialized_form_fill = serialized_form_fills.find { |ff| ff["id"] == @form_fill.id }
    assert_not_nil serialized_form_fill

    serialized_photos = serialized_form_fill["photos"]
    
    # Only 2 photos should be serialized (photo_1 and the signature photo_3)
    # The orphaned photo_2 should NOT be returned
    assert_equal 2, serialized_photos.count
    
    returned_filenames = serialized_photos.map { |p| p["filename"] }
    assert_includes returned_filenames, photo_1.filename.to_s
    assert_includes returned_filenames, photo_3.filename.to_s
    assert_not_includes returned_filenames, photo_2.filename.to_s
  end
end
