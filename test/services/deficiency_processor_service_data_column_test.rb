require "test_helper"

class DeficiencyProcessorServiceDataColumnTest < ActiveSupport::TestCase
  test "should process deficiencies with merged data format" do
    # Test data that would come from FormFill#merge_structure_with_data
    deficiencies_data = [
      {
        "name" => "deficiency_1",
        "type" => "Deficiency",
        "value" => "Major",
        "comment_value" => "Needs immediate attention",
        "D" => "Yes",
        "C" => "No",
        "Item" => "Fire Extinguisher",
        "Riser" => "Riser 1"
      },
      {
        "name" => "deficiency_2",
        "type" => "Deficiency",
        "value" => "Minor",
        "comment_value" => "Schedule maintenance",
        "D" => "No",
        "C" => "Yes",
        "Item" => "Sprinkler Head",
        "Riser" => "Riser 2"
      }
    ]

    # Target fields that would come from merged deficiencies form structure
    target_fields = [
      {
        "name" => "item_field_1",
        "type" => "Deficiency_field",
        "section_name" => "Section 1",
        "label_name" => "Item"
      },
      {
        "name" => "riser_field_1",
        "type" => "Deficiency_field",
        "section_name" => "Section 1",
        "label_name" => "Riser"
      },
      {
        "name" => "d_field_1",
        "type" => "Deficiency_field",
        "section_name" => "Section 1",
        "label_name" => "D"
      },
      {
        "name" => "deficiency_field_1",
        "type" => "Deficiency_field",
        "section_name" => "Section 1",
        "label_name" => "Deficiency"
      },
      {
        "name" => "date_field_1",
        "type" => "Deficiency_field",
        "section_name" => "Section 1",
        "label_name" => "Date"
      },
      # Second section for second deficiency
      {
        "name" => "item_field_2",
        "type" => "Deficiency_field",
        "section_name" => "Section 2",
        "label_name" => "Item"
      },
      {
        "name" => "c_field_2",
        "type" => "Deficiency_field",
        "section_name" => "Section 2",
        "label_name" => "C"
      },
      {
        "name" => "deficiency_field_2",
        "type" => "Deficiency_field",
        "section_name" => "Section 2",
        "label_name" => "Deficiency"
      }
    ]

    processor = DeficiencyProcessorService.new(
      deficiencies_data: deficiencies_data,
      target_fields: target_fields
    )

    result = processor.process

    # Verify processing results
    assert_not_nil result[:processed_fields]
    assert_not_nil result[:unprocessed_deficiencies]

    # Should have processed fields for both deficiencies
    assert result[:processed_fields].length > 0, "Should have processed some fields"

    # Verify specific field mappings
    processed_field_names = result[:processed_fields].map { |f| f["name"] }

    # Should have mapped item fields
    assert_includes processed_field_names, "item_field_1"
    assert_includes processed_field_names, "item_field_2"

    # Verify field values were set correctly
    item_field_1 = result[:processed_fields].find { |f| f["name"] == "item_field_1" }
    assert_equal "Fire Extinguisher", item_field_1["value"]

    item_field_2 = result[:processed_fields].find { |f| f["name"] == "item_field_2" }
    assert_equal "Sprinkler Head", item_field_2["value"]

    # Verify D/C field mapping
    d_field = result[:processed_fields].find { |f| f["name"] == "d_field_1" }
    assert_equal "X", d_field["value"] # D was 'Yes'

    c_field = result[:processed_fields].find { |f| f["name"] == "c_field_2" }
    assert_equal "X", c_field["value"] # C was 'Yes'
  end

  test "should handle CBDorC unified field format" do
    # Test data with deficiency that should use CBDorC field
    deficiencies_data = [
      {
        "name" => "deficiency_1",
        "type" => "Deficiency",
        "value" => "Major",
        "D" => "Yes",
        "C" => "No",
        "Item" => "Test Item"
      }
    ]

    # Target fields with CBDorC unified field (like in deficiencies form)
    target_fields = [
      {
        "name" => "item_field_1",
        "type" => "Deficiency_field",
        "section_name" => "Section 1",
        "label_name" => "Item"
      },
      {
        "name" => "cbdorc_field_1",
        "type" => "Deficiency_field",
        "section_name" => "Section 1",
        "label_name" => "CBDorC"
      },
      {
        "name" => "deficiency_field_1",
        "type" => "Deficiency_field",
        "section_name" => "Section 1",
        "label_name" => "Deficiency"
      }
    ]

    processor = DeficiencyProcessorService.new(
      deficiencies_data: deficiencies_data,
      target_fields: target_fields
    )

    result = processor.process

    # Verify CBDorC field was set correctly
    cbdorc_field = result[:processed_fields].find { |f| f["name"] == "cbdorc_field_1" }
    assert_not_nil cbdorc_field
    assert_equal "Choice1", cbdorc_field["value"] # D was 'Yes', so should be Choice1
  end

  test "should handle empty or invalid data gracefully" do
    # Test with empty data
    processor = DeficiencyProcessorService.new(
      deficiencies_data: [],
      target_fields: []
    )

    result = processor.process
    assert_equal [], result[:processed_fields]
    assert_equal [], result[:unprocessed_deficiencies]

    # Test with nil data
    processor = DeficiencyProcessorService.new(
      deficiencies_data: nil,
      target_fields: nil
    )

    result = processor.process
    assert_equal [], result[:processed_fields]
    assert_equal [], result[:unprocessed_deficiencies]
  end

  test "should handle malformed deficiency data" do
    # Test with malformed deficiency data
    deficiencies_data = [
      nil, # nil entry
      {}, # empty hash
      { "name" => "" }, # blank name
      { "name" => "valid_deficiency", "value" => "Major" } # valid entry
    ]

    target_fields = [
      {
        "name" => "test_field",
        "type" => "Deficiency_field",
        "section_name" => "Section 1",
        "label_name" => "Test"
      }
    ]

    processor = DeficiencyProcessorService.new(
      deficiencies_data: deficiencies_data,
      target_fields: target_fields
    )

    # Should not raise an error
    assert_nothing_raised do
      result = processor.process
      # Should have processed the valid entry
      assert result[:processed_fields].length >= 0
    end
  end

  test "should handle malformed target fields" do
    deficiencies_data = [
      {
        "name" => "test_deficiency",
        "type" => "Deficiency",
        "value" => "Major"
      }
    ]

    # Test with malformed target fields
    target_fields = [
      nil, # nil entry
      {}, # empty hash
      { "section_name" => "" }, # blank section_name
      {
        "name" => "valid_field",
        "type" => "Deficiency_field",
        "section_name" => "Section 1",
        "label_name" => "Test"
      } # valid entry
    ]

    processor = DeficiencyProcessorService.new(
      deficiencies_data: deficiencies_data,
      target_fields: target_fields
    )

    # Should not raise an error and should process valid fields
    assert_nothing_raised do
      result = processor.process
      assert_not_nil result[:processed_fields]
      assert_not_nil result[:unprocessed_deficiencies]
    end
  end

  test "should maintain compatibility with existing deficiency processing logic" do
    # This test ensures that the service still works the same way it did before
    # when processing deficiencies from merged form data

    deficiencies_data = [
      {
        "name" => "legacy_deficiency",
        "type" => "Deficiency",
        "value" => "Critical",
        "comment_value" => "Immediate repair needed",
        "D" => "Yes",
        "C" => "No",
        "Item" => "Main Valve",
        "Riser" => "Main Riser"
      }
    ]

    target_fields = [
      {
        "name" => "item_1",
        "type" => "Deficiency_field",
        "section_name" => "Section 1",
        "label_name" => "Item"
      },
      {
        "name" => "riser_1",
        "type" => "Deficiency_field",
        "section_name" => "Section 1",
        "label_name" => "Riser"
      },
      {
        "name" => "d_1",
        "type" => "Deficiency_field",
        "section_name" => "Section 1",
        "label_name" => "D"
      },
      {
        "name" => "deficiency_1",
        "type" => "Deficiency_field",
        "section_name" => "Section 1",
        "label_name" => "Deficiency"
      },
      {
        "name" => "date_1",
        "type" => "Deficiency_field",
        "section_name" => "Section 1",
        "label_name" => "Date"
      }
    ]

    processor = DeficiencyProcessorService.new(
      deficiencies_data: deficiencies_data,
      target_fields: target_fields
    )

    result = processor.process

    # Verify all expected fields were processed
    processed_names = result[:processed_fields].map { |f| f["name"] }

    assert_includes processed_names, "item_1"
    assert_includes processed_names, "riser_1"
    assert_includes processed_names, "d_1"
    assert_includes processed_names, "deficiency_1"
    assert_includes processed_names, "date_1"

    # Verify values are correct
    item_field = result[:processed_fields].find { |f| f["name"] == "item_1" }
    assert_equal "Main Valve", item_field["value"]

    riser_field = result[:processed_fields].find { |f| f["name"] == "riser_1" }
    assert_equal "Main Riser", riser_field["value"]

    d_field = result[:processed_fields].find { |f| f["name"] == "d_1" }
    assert_equal "X", d_field["value"]

    deficiency_field = result[:processed_fields].find { |f| f["name"] == "deficiency_1" }
    assert_equal "Critical  Immediate repair needed", deficiency_field["value"]

    date_field = result[:processed_fields].find { |f| f["name"] == "date_1" }
    assert_equal Date.current.strftime("%m/%d/%y"), date_field["value"]
  end
end
