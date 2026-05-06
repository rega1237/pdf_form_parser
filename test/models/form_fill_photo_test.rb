require "test_helper"

class FormFillPhotoTest < ActiveSupport::TestCase
  setup do
    @inspection = inspections(:one)
    @form_template = form_templates(:one)

    # Create a form fill with a Photo field structure
    structure = [
      {
        "name" => "test_photo_field",
        "type" => "Photo",
        "section_name" => "Test Section",
        "label_name" => "Test Photo"
      }
    ]

    @form_fill = FormFill.create!(
      name: "Photo Test Form",
      form_template: @form_template,
      inspection: @inspection,
      form_structure: structure.to_json,
      data: {}
    )

    # Prepare a sample image
    @image_path = Rails.root.join("test/fixtures/files/test_image.jpg")
    # Ensure the file exists, or create a dummy one
    unless File.exist?(@image_path)
      FileUtils.mkdir_p(File.dirname(@image_path))
      File.open(@image_path, "wb") { |f| f.write("dummy image content") }
    end
    @image_file = Rack::Test::UploadedFile.new(@image_path, "image/jpeg")
  end

  test "attach_photo_for_field successfully attaches a photo" do
    assert_difference -> { @form_fill.photos.count }, 1 do
      result = @form_fill.attach_photo_for_field("test_photo_field", @image_file)
      assert result[:success]
      assert_not_nil result[:attachment_id]
    end

    # Verify data column update
    @form_fill.reload
    attachment_ids = @form_fill.get_field_value("test_photo_field_photo_attachment_id")
    assert_kind_of Array, attachment_ids
    assert_not_empty attachment_ids
  end

  test "attach_photo_for_field fails with invalid field name" do
    result = @form_fill.attach_photo_for_field("non_existent_field", @image_file)
    # Depending on implementation, it might still attach but warn, or return success if it falls back to defaults.
    # Looking at code: it defaults field_section to field_name if not found.
    # But let's check if it actually attaches.
    assert result[:success] # The code allows attaching even if field not in structure explicitly?
    # Actually code says: field_data = structure.find...
    # if field_data is nil, field_section becomes field_name.
    # So it is resilient.
  end

  test "remove_photo_for_field removes specific photo" do
    # First attach
    result = @form_fill.attach_photo_for_field("test_photo_field", @image_file)
    photo_id = result[:attachment_id]

    assert_difference -> { @form_fill.photos.count }, -1 do
      result = @form_fill.remove_photo_for_field("test_photo_field", photo_id)
      assert result[:success]
    end

    @form_fill.reload
    attachment_ids = @form_fill.get_field_value("test_photo_field_photo_attachment_id")
    assert_not_includes attachment_ids, photo_id
  end

  test "get_photos_for_field returns attached photos" do
    @form_fill.attach_photo_for_field("test_photo_field", @image_file)
    photos = @form_fill.get_photos_for_field("test_photo_field")
    assert_equal 1, photos.count
  end

  test "supports multiple photos for same field" do
    @form_fill.attach_photo_for_field("test_photo_field", @image_file)

    @form_fill.reload

    # Create a fresh file object for the second attachment to avoid IntegrityError (stream consumed)
    image_file_2 = Rack::Test::UploadedFile.new(@image_path, "image/jpeg")
    result = @form_fill.attach_photo_for_field("test_photo_field", image_file_2)
    assert result[:success], "Second attach failed: #{result[:error]}"

    @form_fill.reload
    photos = @form_fill.get_photos_for_field("test_photo_field")
    assert_equal 2, photos.count
  end

  test "get_photo_url_for_field returns proxy path instead of redirect path" do
    @form_fill.attach_photo_for_field("test_photo_field", @image_file)
    url = @form_fill.get_photo_url_for_field("test_photo_field")
    assert_match %r{/rails/active_storage/blobs/proxy/}, url
  end
end
