require "test_helper"

class FormFillDataMethodsTest < Minitest::Test
  def setup
    # Clean up any existing data
    FormFill.delete_all
    Inspection.delete_all
    FormTemplate.delete_all

    # Create objects directly without fixtures, bypassing validations
    @form_template = FormTemplate.new(
      name: "Test Template #{SecureRandom.hex(4)}",
      original_filename: "test.pdf",
      file_type: "pdf",
      form_structure: "[]"
    )
    @form_template.save!(validate: false)

    @form_fill = FormFill.create!(
      name: "Test Form Fill #{SecureRandom.hex(4)}",
      form_template: @form_template,
      form_structure: "[]",
      data: {}
    )
  end

  def teardown
    # Clean up after each test
    FormFill.delete_all
    Inspection.delete_all
    FormTemplate.delete_all
  end

  # ========================================
  # TESTS FOR NEW DATA ACCESS METHODS
  # ========================================

  def test_get_field_value_returns_nil_for_blank_field_name
    assert_nil @form_fill.get_field_value("")
    assert_nil @form_fill.get_field_value(nil)
  end

  def test_get_field_value_returns_nil_for_non_existent_field
    assert_nil @form_fill.get_field_value("non_existent_field")
  end

  def test_get_field_value_returns_correct_value_for_existing_field
    @form_fill.update!(data: { "test_field" => "test_value" })
    assert_equal "test_value", @form_fill.get_field_value("test_field")
  end

  def test_get_field_value_works_with_symbol_field_names
    @form_fill.update!(data: { "test_field" => "test_value" })
    assert_equal "test_value", @form_fill.get_field_value(:test_field)
  end

  def test_set_field_value_returns_false_for_blank_field_name
    assert_equal false, @form_fill.set_field_value("", "value")
    assert_equal false, @form_fill.set_field_value(nil, "value")
  end

  def test_set_field_value_stores_value_correctly
    result = @form_fill.set_field_value("new_field", "new_value")

    assert result
    @form_fill.reload
    assert_equal "new_value", @form_fill.data["new_field"]
  end

  def test_set_field_value_works_with_symbol_field_names
    result = @form_fill.set_field_value(:symbol_field, "symbol_value")

    assert result
    @form_fill.reload
    assert_equal "symbol_value", @form_fill.data["symbol_field"]
  end

  def test_set_field_value_initializes_data_hash_if_nil
    # Since data column has NOT NULL constraint, we'll test with empty hash instead
    @form_fill.update!(data: {})

    result = @form_fill.set_field_value("test_field", "test_value")

    assert result
    @form_fill.reload
    assert_equal "test_value", @form_fill.data["test_field"]
  end

  def test_set_field_value_overwrites_existing_values
    @form_fill.update!(data: { "existing_field" => "old_value" })

    result = @form_fill.set_field_value("existing_field", "new_value")

    assert result
    @form_fill.reload
    assert_equal "new_value", @form_fill.data["existing_field"]
  end

  def test_set_field_value_preserves_other_fields
    @form_fill.update!(data: { "field1" => "value1", "field2" => "value2" })

    result = @form_fill.set_field_value("field3", "value3")

    assert result
    @form_fill.reload
    assert_equal "value1", @form_fill.data["field1"]
    assert_equal "value2", @form_fill.data["field2"]
    assert_equal "value3", @form_fill.data["field3"]
  end

  def test_bulk_update_data_returns_false_for_blank_input
    assert_equal false, @form_fill.bulk_update_data(nil)
    assert_equal false, @form_fill.bulk_update_data({})
    assert_equal false, @form_fill.bulk_update_data("not_a_hash")
  end

  def test_bulk_update_data_updates_multiple_fields_correctly
    update_hash = {
      "field1" => "value1",
      "field2" => "value2",
      "field3" => "value3"
    }

    result = @form_fill.bulk_update_data(update_hash)

    assert result
    @form_fill.reload
    assert_equal "value1", @form_fill.data["field1"]
    assert_equal "value2", @form_fill.data["field2"]
    assert_equal "value3", @form_fill.data["field3"]
  end

  def test_bulk_update_data_works_with_symbol_keys
    update_hash = {
      field1: "value1",
      field2: "value2"
    }

    result = @form_fill.bulk_update_data(update_hash)

    assert result
    @form_fill.reload
    assert_equal "value1", @form_fill.data["field1"]
    assert_equal "value2", @form_fill.data["field2"]
  end

  def test_bulk_update_data_initializes_data_hash_if_nil
    # Since data column has NOT NULL constraint, we'll test with empty hash instead
    @form_fill.update!(data: {})

    update_hash = { "test_field" => "test_value" }
    result = @form_fill.bulk_update_data(update_hash)

    assert result
    @form_fill.reload
    assert_equal "test_value", @form_fill.data["test_field"]
  end

  def test_bulk_update_data_preserves_existing_fields_not_in_update
    @form_fill.update!(data: { "existing_field" => "existing_value" })

    update_hash = { "new_field" => "new_value" }
    result = @form_fill.bulk_update_data(update_hash)

    assert result
    @form_fill.reload
    assert_equal "existing_value", @form_fill.data["existing_field"]
    assert_equal "new_value", @form_fill.data["new_field"]
  end

  def test_bulk_update_data_overwrites_existing_fields_in_update
    @form_fill.update!(data: { "field1" => "old_value", "field2" => "keep_value" })

    update_hash = { "field1" => "new_value", "field3" => "another_value" }
    result = @form_fill.bulk_update_data(update_hash)

    assert result
    @form_fill.reload
    assert_equal "new_value", @form_fill.data["field1"]
    assert_equal "keep_value", @form_fill.data["field2"]
    assert_equal "another_value", @form_fill.data["field3"]
  end

  def test_bulk_update_data_handles_mixed_data_types
    update_hash = {
      "string_field" => "string_value",
      "number_field" => 42,
      "boolean_field" => true,
      "array_field" => [ 1, 2, 3 ],
      "hash_field" => { "nested" => "value" }
    }

    result = @form_fill.bulk_update_data(update_hash)

    assert result
    @form_fill.reload
    assert_equal "string_value", @form_fill.data["string_field"]
    assert_equal 42, @form_fill.data["number_field"]
    assert_equal true, @form_fill.data["boolean_field"]
    assert_equal [ 1, 2, 3 ], @form_fill.data["array_field"]
    assert_equal({ "nested" => "value" }, @form_fill.data["hash_field"])
  end

  # ========================================
  # TESTS FOR LEGACY DATA MIGRATION METHODS
  # ========================================

  def test_has_legacy_data_returns_false_for_blank_structure
    @form_fill.update!(form_structure: nil)
    assert_equal false, @form_fill.has_legacy_data?

    @form_fill.update!(form_structure: "")
    assert_equal false, @form_fill.has_legacy_data?
  end

  def test_has_legacy_data_returns_false_for_structure_without_values
    structure = [
      { "name" => "field1", "type" => "text" },
      { "name" => "field2", "type" => "select" }
    ]
    @form_fill.update!(form_structure: structure.to_json)
    assert_equal false, @form_fill.has_legacy_data?
  end

  def test_has_legacy_data_returns_false_for_structure_with_empty_values
    structure = [
      { "name" => "field1", "type" => "text", "value" => "" },
      { "name" => "field2", "type" => "select", "value" => nil }
    ]
    @form_fill.update!(form_structure: structure.to_json)
    assert_equal false, @form_fill.has_legacy_data?
  end

  def test_has_legacy_data_returns_true_for_structure_with_values
    structure = [
      { "name" => "field1", "type" => "text", "value" => "test_value" },
      { "name" => "field2", "type" => "select", "value" => "" }
    ]
    @form_fill.update!(form_structure: structure.to_json)
    assert_equal true, @form_fill.has_legacy_data?
  end

  def test_has_legacy_data_handles_invalid_json
    @form_fill.update!(form_structure: "invalid json")
    assert_equal false, @form_fill.has_legacy_data?
  end

  def test_migrate_legacy_data_returns_false_when_no_legacy_data
    structure = [
      { "name" => "field1", "type" => "text" },
      { "name" => "field2", "type" => "select" }
    ]
    @form_fill.update!(form_structure: structure.to_json)
    assert_equal false, @form_fill.migrate_legacy_data!
  end

  def test_migrate_legacy_data_migrates_values_to_data_column
    structure = [
      { "name" => "field1", "type" => "text", "value" => "value1" },
      { "name" => "field2", "type" => "select", "value" => "value2" },
      { "name" => "field3", "type" => "text", "value" => "" } # Empty value should not be migrated
    ]
    @form_fill.update!(form_structure: structure.to_json, data: {})

    result = @form_fill.migrate_legacy_data!

    assert result
    @form_fill.reload
    assert_equal "value1", @form_fill.data["field1"]
    assert_equal "value2", @form_fill.data["field2"]
    assert_nil @form_fill.data["field3"] # Empty value not migrated
  end

  def test_migrate_legacy_data_preserves_existing_data_column_values
    structure = [
      { "name" => "field1", "type" => "text", "value" => "legacy_value" },
      { "name" => "field2", "type" => "select", "value" => "legacy_value2" }
    ]
    existing_data = { "field1" => "existing_value", "field3" => "other_value" }
    @form_fill.update!(form_structure: structure.to_json, data: existing_data)

    result = @form_fill.migrate_legacy_data!

    assert result
    @form_fill.reload
    # Existing data should be preserved
    assert_equal "existing_value", @form_fill.data["field1"]
    assert_equal "other_value", @form_fill.data["field3"]
    # New legacy data should be added
    assert_equal "legacy_value2", @form_fill.data["field2"]
  end

  def test_migrate_legacy_data_cleans_values_from_structure
    structure = [
      { "name" => "field1", "type" => "text", "value" => "value1", "other_prop" => "keep" },
      { "name" => "field2", "type" => "select", "value" => "value2" }
    ]
    @form_fill.update!(form_structure: structure.to_json, data: {})

    @form_fill.migrate_legacy_data!
    @form_fill.reload

    updated_structure = JSON.parse(@form_fill.form_structure)

    # Values should be removed from structure
    assert_nil updated_structure[0]["value"]
    assert_nil updated_structure[1]["value"]

    # Other properties should be preserved
    assert_equal "keep", updated_structure[0]["other_prop"]
    assert_equal "field1", updated_structure[0]["name"]
    assert_equal "text", updated_structure[0]["type"]
  end

  def test_migrate_legacy_data_handles_invalid_json
    @form_fill.update!(form_structure: "invalid json")
    assert_equal false, @form_fill.migrate_legacy_data!
  end

  def test_merge_structure_with_data_returns_empty_for_blank_structure
    @form_fill.update!(form_structure: nil)
    assert_equal [], @form_fill.merge_structure_with_data

    @form_fill.update!(form_structure: "")
    assert_equal [], @form_fill.merge_structure_with_data
  end

  def test_merge_structure_with_data_merges_data_column_values
    structure = [
      { "name" => "field1", "type" => "text" },
      { "name" => "field2", "type" => "select" },
      { "name" => "field3", "type" => "text" }
    ]
    data = { "field1" => "data_value1", "field2" => "data_value2" }
    @form_fill.update!(form_structure: structure.to_json, data: data)

    result = @form_fill.merge_structure_with_data

    assert_equal 3, result.length
    assert_equal "data_value1", result[0]["value"]
    assert_equal "data_value2", result[1]["value"]
    assert_nil result[2]["value"] # No data for field3
  end

  def test_merge_structure_with_data_prefers_data_column_over_structure_values
    structure = [
      { "name" => "field1", "type" => "text", "value" => "structure_value" },
      { "name" => "field2", "type" => "select", "value" => "structure_value2" }
    ]
    data = { "field1" => "data_value" } # Only field1 has data column value
    @form_fill.update!(form_structure: structure.to_json, data: data)

    result = @form_fill.merge_structure_with_data

    assert_equal 2, result.length
    # Data column value should take precedence
    assert_equal "data_value", result[0]["value"]
    # Structure value should be used when no data column value exists
    assert_equal "structure_value2", result[1]["value"]
  end

  def test_merge_structure_with_data_handles_invalid_json
    @form_fill.update!(form_structure: "invalid json")
    assert_equal [], @form_fill.merge_structure_with_data
  end

  def test_merge_structure_with_data_preserves_structure_properties
    structure = [
      { "name" => "field1", "type" => "text", "required" => true, "placeholder" => "Enter text" }
    ]
    data = { "field1" => "test_value" }
    @form_fill.update!(form_structure: structure.to_json, data: data)

    result = @form_fill.merge_structure_with_data

    assert_equal 1, result.length
    field = result[0]
    assert_equal "field1", field["name"]
    assert_equal "text", field["type"]
    assert_equal true, field["required"]
    assert_equal "Enter text", field["placeholder"]
    assert_equal "test_value", field["value"]
  end

  # ========================================
  # TESTS FOR UPDATED PHOTO HANDLING METHODS
  # ========================================

  def test_update_photo_attachment_id_in_structure_stores_in_data_column
    field_name = "photo_field"
    attachment_id = "test_attachment_123"

    result = @form_fill.update_photo_attachment_id_in_structure(field_name, attachment_id)

    assert result
    @form_fill.reload
    assert_equal [ attachment_id ], @form_fill.data["#{field_name}_photo_attachment_id"]
  end

  def test_update_photo_attachment_id_in_structure_returns_false_for_blank_field_name
    assert_equal false, @form_fill.update_photo_attachment_id_in_structure("", "attachment_id")
    assert_equal false, @form_fill.update_photo_attachment_id_in_structure(nil, "attachment_id")
  end

  def test_get_photo_for_field_returns_nil_for_blank_field_name
    assert_nil @form_fill.get_photo_for_field("")
    assert_nil @form_fill.get_photo_for_field(nil)
  end

  def test_get_photo_for_field_returns_nil_when_no_attachment_id_stored
    assert_nil @form_fill.get_photo_for_field("photo_field")
  end

  def test_get_photo_for_field_returns_nil_when_no_matching_photo_found
    field_name = "photo_field"
    attachment_id = "nonexistent_attachment_123"

    @form_fill.set_field_value("#{field_name}_photo_attachment_id", attachment_id)

    assert_nil @form_fill.get_photo_for_field(field_name)
  end

  def test_clear_photo_attachment_id_in_structure_clears_data_column
    field_name = "photo_field"
    attachment_id = "test_attachment_123"

    # Set up initial data
    @form_fill.set_field_value("#{field_name}_photo_attachment_id", attachment_id)
    @form_fill.set_field_value(field_name, "some_value")

    result = @form_fill.clear_photo_attachment_id_in_structure(field_name)

    assert result
    @form_fill.reload
    assert_nil @form_fill.data["#{field_name}_photo_attachment_id"]
    assert_equal "", @form_fill.data[field_name]
  end

  def test_clear_photo_attachment_id_in_structure_returns_false_for_blank_field_name
    assert_equal false, @form_fill.clear_photo_attachment_id_in_structure("")
    assert_equal false, @form_fill.clear_photo_attachment_id_in_structure(nil)
  end

  def test_get_photos_by_field_returns_empty_hash_when_no_photos
    assert_equal({}, @form_fill.get_photos_by_field)
  end

  def test_get_photos_by_field_returns_empty_hash_when_no_photo_attachment_ids
    @form_fill.update!(data: { "field1" => "value1", "field2" => "value2" })
    assert_equal({}, @form_fill.get_photos_by_field)
  end

  def test_get_photos_by_field_returns_empty_hash_when_attachment_ids_but_no_photos
    @form_fill.update!(data: {
                         "photo_field_photo_attachment_id" => "attachment_123",
                         "another_field_photo_attachment_id" => "attachment_456"
                       })

    # No actual photos attached, so should return empty hash
    assert_equal({}, @form_fill.get_photos_by_field)
  end

  def test_get_photos_by_field_extracts_field_names_correctly
    # Test that the method correctly extracts field names from photo attachment ID keys
    @form_fill.update!(data: {
                         "simple_field_photo_attachment_id" => "attachment_123",
                         "complex_field_name_photo_attachment_id" => "attachment_456",
                         "not_a_photo_field" => "some_value",
                         "field_with_photo_attachment_id_suffix_photo_attachment_id" => "attachment_789"
                       })

    # Since no actual photos are attached, this will return empty hash
    # but we can verify the method processes the keys correctly by checking it doesn't error
    result = @form_fill.get_photos_by_field
    assert_equal({}, result)
  end
end
