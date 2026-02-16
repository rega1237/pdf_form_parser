require "test_helper"

class DeficiencyProcessorServiceTest < ActiveSupport::TestCase
  test "should only populate Date Found with inspection date and leave Date Corrected blank" do
    # Test data
    deficiencies_data = [
      {
        "name" => "deficiency_1",
        "type" => "Deficiency",
        "value" => "Broken Pipe",
        "item" => "Pipe",
        "riser" => "Main",
        "D" => "Yes"
      }
    ]

    # Target fields simulating the Corrected Deficiencies form structure
    target_fields = [
      {
        "name" => "date_found_1",
        "section_name" => "Corrective Action Performed row 1",
        "label_name" => "Date Found"
      },
      {
        "name" => "date_corrected_1",
        "section_name" => "Corrective Action Performed row 1",
        "label_name" => "Date Corrected"
      },
      {
        "name" => "description_1",
        "section_name" => "Corrective Action Performed row 1",
        "label_name" => "Deficiency Description"
      }
    ]

    inspection_date = Date.new(2023, 10, 15)

    processor = DeficiencyProcessorService.new(
      deficiencies_data: deficiencies_data,
      target_fields: target_fields,
      inspection_date: inspection_date,
      strict_date_mode: true # Strict mode ON
    )

    result = processor.process
    processed_fields = result[:processed_fields]

    # Verify Date Found is populated
    date_found = processed_fields.find { |f| f["name"] == "date_found_1" }
    assert_not_nil date_found, "Date Found field should be present in processed fields"
    assert_equal "10/15/23", date_found["value"]

    # Verify Date Corrected is NOT populated (strict mode behavior)
    date_corrected = processed_fields.find { |f| f["name"] == "date_corrected_1" }

    if date_corrected
      assert_nil date_corrected["value"], "Date Corrected should be nil in strict mode"
    end
  end

  test "should populate all date fields when strict_date_mode is false (legacy behavior)" do
    # Test data
    deficiencies_data = [
      {
        "name" => "deficiency_1",
        "type" => "Deficiency",
        "value" => "Broken Pipe",
        "item" => "Pipe",
        "riser" => "Main",
        "D" => "Yes"
      }
    ]

    target_fields = [
      {
        "name" => "date_found_1",
        "section_name" => "Corrective Action Performed row 1",
        "label_name" => "Date Found"
      },
      {
        "name" => "date_corrected_1",
        "section_name" => "Corrective Action Performed row 1",
        "label_name" => "Date Corrected"
      }
    ]

    inspection_date = Date.new(2023, 10, 15)

    processor = DeficiencyProcessorService.new(
      deficiencies_data: deficiencies_data,
      target_fields: target_fields,
      inspection_date: inspection_date,
      strict_date_mode: false # Strict mode OFF (default)
    )

    result = processor.process
    processed_fields = result[:processed_fields]

    # Verify Date Found is populated
    date_found = processed_fields.find { |f| f["name"] == "date_found_1" }
    assert_equal "10/15/23", date_found["value"]

    # Verify Date Corrected IS populated (legacy behavior)
    date_corrected = processed_fields.find { |f| f["name"] == "date_corrected_1" }
    assert_not_nil date_corrected
    assert_equal "10/15/23", date_corrected["value"]
  end
end
