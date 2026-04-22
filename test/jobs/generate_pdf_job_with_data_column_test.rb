require "test_helper"

class GeneratePdfJobWithDataColumnTest < ActiveJob::TestCase
  include ActionDispatch::TestProcess

  setup do
    @customer = customers(:one)
    @property = properties(:one)
    @form_template = form_templates(:one)
    @inspection = Inspection.create!(
      property: @property,
      form_template: @form_template,
      system_category: "Fire Sprinkler",
      interval_category: "Annual",
      user: users(:one),
      date: Date.today
    )

    # Create a form fill with data in the new data column format
    @form_fill = FormFill.create!(
      name: "Test Form Fill",
      form_template: @form_template,
      inspection: @inspection,
      form_structure: test_form_structure.to_json,
      data: test_form_data,
      pdf_generation_status: "generating"
    )
  end

  test "should use merged data for PDF generation" do
    # Mock the form template to have an attached file
    mock_file = Tempfile.new([ "test", ".pdf" ])
    mock_file.write("mock pdf content")
    mock_file.rewind

    @form_template.original_file.attach(
      io: mock_file,
      filename: "test_template.pdf",
      content_type: "application/pdf"
    )

    # Mock the PDF generation services
    PdfFormsParserService.any_instance.stubs(:fill_form).returns("/tmp/test.pdf")
    PdfMergingService.any_instance.stubs(:merge).returns(mock_pdf_object)
    PdfMergingService.stubs(:add_images_to_pdf).returns(mock_pdf_object)

    # Mock file operations
    FileUtils.stubs(:rm_f)

    # Ensure the mock_pdf_object actually saves a file
    mock_pdf_object.stubs(:save) do |path|
      File.write(path, "%PDF-1.4 dummy content")
      true
    end

    # Perform the job
    GeneratePdfJob.perform_now(@form_fill.id)

    # Verify the form fill status was updated
    @form_fill.reload
    assert_equal "completed", @form_fill.pdf_generation_status
  end

  test "should handle deficiencies form with merged data" do
    # Create deficiencies template and form fill
    deficiencies_template = FormTemplate.create!(
      name: "Deficiencies",
      original_file: fixture_file_upload("test.pdf", "application/pdf")
    )

    deficiencies_form_fill = FormFill.create!(
      name: "Deficiencies Form",
      form_template: deficiencies_template,
      inspection: @inspection,
      form_structure: deficiencies_form_structure.to_json,
      data: deficiencies_form_data
    )

    # Mock the main form template
    @form_template.original_file.attach(
      io: Tempfile.new([ "test", ".pdf" ]),
      filename: "test_template.pdf",
      content_type: "application/pdf"
    )

    # Mock services
    PdfFormsParserService.any_instance.stubs(:fill_form).returns("/tmp/test.pdf")
    PdfMergingService.any_instance.stubs(:merge).returns(mock_pdf_object)
    PdfMergingService.stubs(:add_images_to_pdf).returns(mock_pdf_object)

    # Ensure the mock_pdf_object actually saves a file
    mock_pdf_object.stubs(:save) do |path|
      File.write(path, "%PDF-1.4 dummy content")
      true
    end

    FileUtils.stubs(:rm_f)

    # Perform the job
    GeneratePdfJob.perform_now(@form_fill.id)

    # Verify success
    @form_fill.reload
    assert_equal "completed", @form_fill.pdf_generation_status
  end

  test "should maintain PDF output consistency with new data structure" do
    # This test ensures that PDFs generated with the new data structure
    # are identical to those generated with the old structure

    # Create two identical form fills - one with legacy structure, one with new data column
    legacy_form_fill = FormFill.create!(
      name: "Legacy Form Fill",
      form_template: @form_template,
      inspection: @inspection,
      form_structure: legacy_form_structure_with_values.to_json,
      data: {},
      pdf_generation_status: "generating"
    )

    new_form_fill = FormFill.create!(
      name: "New Form Fill",
      form_template: @form_template,
      inspection: @inspection,
      form_structure: test_form_structure.to_json,
      data: test_form_data,
      pdf_generation_status: "generating"
    )

    # Mock template file
    @form_template.original_file.attach(
      io: Tempfile.new([ "test", ".pdf" ]),
      filename: "test_template.pdf",
      content_type: "application/pdf"
    )

    # Capture the field data passed to PDF generation for both forms
    captured_data = {}

    PdfFormsParserService.any_instance.stubs(:fill_form).with do |path, fields|
      name = path.to_s.include?("legacy") ? :legacy : :new
      captured_data[name] = fields
      true
    end.returns(true)

    PdfMergingService.any_instance.stubs(:merge).returns(mock_pdf_object)

    # Ensure the mock_pdf_object actually saves a file
    mock_pdf_object.stubs(:save) do |path|
      File.write(path, "%PDF-1.4 dummy content")
      true
    end

    FileUtils.stubs(:rm_f)

    # Generate PDFs for both forms
    GeneratePdfJob.perform_now(legacy_form_fill.id)
    GeneratePdfJob.perform_now(new_form_fill.id)

    # Verify both jobs completed successfully
    assert_equal "completed", legacy_form_fill.reload.pdf_generation_status, "Legacy job failed"
    assert_equal "completed", new_form_fill.reload.pdf_generation_status, "New job failed"

    # Verify that the field data passed to PDF generation is identical
    assert_not_nil captured_data[:legacy], "Legacy fields should be captured"
    assert_not_nil captured_data[:new], "New fields should be captured"

    # Compare field values (the important part for PDF generation)
    legacy_values = captured_data[:legacy].map { |f| [ f["name"], f["value"] ] }.to_h
    new_values = captured_data[:new].map { |f| [ f["name"], f["value"] ] }.to_h

    assert_equal legacy_values, new_values,
                 "PDF field values should be identical between legacy and new data structures"
  end

  private

  def test_form_structure
    [
      {
        "name" => "field_1",
        "type" => "Text",
        "label_name" => "Field 1"
      },
      {
        "name" => "field_2",
        "type" => "Deficiency",
        "label_name" => "Deficiency Field"
      }
    ]
  end

  def test_form_data
    {
      "field_1" => "Test Value 1",
      "field_2_select" => "Minor"
    }
  end

  def merged_test_data
    [
      {
        "name" => "field_1",
        "type" => "Text",
        "label_name" => "Field 1",
        "value" => "Test Value 1"
      },
      {
        "name" => "field_2",
        "type" => "Deficiency",
        "label_name" => "Deficiency Field",
        "value" => "Minor"
      }
    ]
  end

  def merged_test_data_with_deficiencies
    [
      {
        "name" => "field_1",
        "type" => "Text",
        "label_name" => "Field 1",
        "value" => "Test Value 1"
      },
      {
        "name" => "deficiency_1",
        "type" => "Deficiency",
        "label_name" => "Deficiency 1",
        "value" => "Major",
        "comment_value" => "Needs immediate attention"
      }
    ]
  end

  def deficiencies_form_structure
    [
      {
        "name" => "deficiency_field_1",
        "type" => "Deficiency_field",
        "section_name" => "Section 1"
      }
    ]
  end

  def deficiencies_form_data
    {
      "deficiency_field_1" => "Processed deficiency"
    }
  end

  def merged_deficiencies_data
    [
      {
        "name" => "deficiency_field_1",
        "type" => "Deficiency_field",
        "section_name" => "Section 1",
        "value" => "Processed deficiency"
      }
    ]
  end

  def legacy_form_structure_with_values
    [
      {
        "name" => "field_1",
        "type" => "Text",
        "label_name" => "Field 1",
        "value" => "Test Value 1"
      },
      {
        "name" => "field_2",
        "type" => "Deficiency",
        "label_name" => "Deficiency Field",
        "value" => "Minor"
      }
    ]
  end

  def mock_pdf_object
    @mock_pdf_object ||= begin
      obj = Object.new
      obj.define_singleton_method(:save) do |path|
        File.write(path, "%PDF-1.4 dummy content")
        true
      end
      obj.define_singleton_method(:<<) { |other| obj }
      obj
    end
  end
end
