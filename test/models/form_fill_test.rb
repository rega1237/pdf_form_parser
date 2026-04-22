require "test_helper"

class FormFillTest < ActiveSupport::TestCase
  self.use_transactional_tests = true

  def self.fixture_path
    nil
  end

  def setup
    @form_template = FormTemplate.new(
      name: "Test Template",
      original_filename: "test.pdf",
      file_path: "/test/path",
      file_type: "pdf",
      form_structure: "[]"
    )
    @form_template.save!(validate: false)

    @form_fill = FormFill.create!(
      name: "Test Form Fill",
      form_template: @form_template,
      form_structure: "[]",
      data: {}
    )
  end

  # ========================================
  # TESTS FOR NEW DATA ACCESS METHODS
  # ========================================

  test "get_field_value returns nil for blank field name" do
    assert_nil @form_fill.get_field_value("")
    assert_nil @form_fill.get_field_value(nil)
  end

  test "get_field_value returns nil for non-existent field" do
    assert_nil @form_fill.get_field_value("non_existent_field")
  end

  test "get_field_value returns correct value for existing field" do
    @form_fill.update!(data: { "test_field" => "test_value" })
    assert_equal "test_value", @form_fill.get_field_value("test_field")
  end

  test "get_field_value works with symbol field names" do
    @form_fill.update!(data: { "test_field" => "test_value" })
    assert_equal "test_value", @form_fill.get_field_value(:test_field)
  end

  test "set_field_value returns false for blank field name" do
    assert_equal false, @form_fill.set_field_value("", "value")
    assert_equal false, @form_fill.set_field_value(nil, "value")
  end

  test "set_field_value stores value correctly" do
    result = @form_fill.set_field_value("new_field", "new_value")

    assert result
    @form_fill.reload
    assert_equal "new_value", @form_fill.data["new_field"]
  end

  test "set_field_value works with symbol field names" do
    result = @form_fill.set_field_value(:symbol_field, "symbol_value")

    assert result
    @form_fill.reload
    assert_equal "symbol_value", @form_fill.data["symbol_field"]
  end

  test "set_field_value initializes data hash if nil" do
    # Since data column has NOT NULL constraint, we'll test with empty hash instead
    @form_fill.update!(data: {})

    result = @form_fill.set_field_value("test_field", "test_value")

    assert result
    @form_fill.reload
    assert_equal "test_value", @form_fill.data["test_field"]
  end

  test "set_field_value overwrites existing values" do
    @form_fill.update!(data: { "existing_field" => "old_value" })

    result = @form_fill.set_field_value("existing_field", "new_value")

    assert result
    @form_fill.reload
    assert_equal "new_value", @form_fill.data["existing_field"]
  end

  test "set_field_value preserves other fields" do
    @form_fill.update!(data: { "field1" => "value1", "field2" => "value2" })

    result = @form_fill.set_field_value("field3", "value3")

    assert result
    @form_fill.reload
    assert_equal "value1", @form_fill.data["field1"]
    assert_equal "value2", @form_fill.data["field2"]
    assert_equal "value3", @form_fill.data["field3"]
  end

  test "bulk_update_data returns false for blank input" do
    assert_equal false, @form_fill.bulk_update_data(nil)
    assert_equal false, @form_fill.bulk_update_data({})
    assert_equal false, @form_fill.bulk_update_data("not_a_hash")
  end

  test "bulk_update_data updates multiple fields correctly" do
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

  test "bulk_update_data works with symbol keys" do
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

  test "bulk_update_data initializes data hash if nil" do
    # Since data column has NOT NULL constraint, we'll test with empty hash instead
    @form_fill.update!(data: {})

    update_hash = { "test_field" => "test_value" }
    result = @form_fill.bulk_update_data(update_hash)

    assert result
    @form_fill.reload
    assert_equal "test_value", @form_fill.data["test_field"]
  end

  test "bulk_update_data preserves existing fields not in update" do
    @form_fill.update!(data: { "existing_field" => "existing_value" })

    update_hash = { "new_field" => "new_value" }
    result = @form_fill.bulk_update_data(update_hash)

    assert result
    @form_fill.reload
    assert_equal "existing_value", @form_fill.data["existing_field"]
    assert_equal "new_value", @form_fill.data["new_field"]
  end

  test "bulk_update_data overwrites existing fields in update" do
    @form_fill.update!(data: { "field1" => "old_value", "field2" => "keep_value" })

    update_hash = { "field1" => "new_value", "field3" => "another_value" }
    result = @form_fill.bulk_update_data(update_hash)

    assert result
    @form_fill.reload
    assert_equal "new_value", @form_fill.data["field1"]
    assert_equal "keep_value", @form_fill.data["field2"]
    assert_equal "another_value", @form_fill.data["field3"]
  end

  test "bulk_update_data handles mixed data types" do
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
end
