require 'test_helper'

class GeneratePdfJobDataColumnTest < ActiveJob::TestCase
  test 'should call merge_structure_with_data for PDF generation' do
    # Create minimal test objects
    form_fill = FormFill.new(
      id: 1,
      form_structure: '[]',
      data: {},
      pdf_generation_status: 'generating'
    )

    inspection = Inspection.new(id: 1)
    form_template = FormTemplate.new(name: 'Test Template')

    # Mock the relationships
    form_fill.stubs(:inspection).returns(inspection)
    form_fill.stubs(:form_template).returns(form_template)
    form_fill.stubs(:generating?).returns(true)
    form_fill.stubs(:update!).returns(true)

    # Mock FormFill.find to return our test object
    FormFill.stubs(:find).with(1).returns(form_fill)

    # Mock the template file attachment
    original_file = mock('original_file')
    original_file.stubs(:attached?).returns(true)
    form_template.stubs(:original_file).returns(original_file)

    # Mock the blob and tempfile
    blob = mock('blob')
    tempfile = mock('tempfile')
    tempfile.stubs(:path).returns('/tmp/test.pdf')
    blob.stubs(:open).yields(tempfile)
    original_file.stubs(:blob).returns(blob)

    # This is the key test - ensure merge_structure_with_data is called
    merged_data = [{ 'name' => 'test_field', 'value' => 'test_value' }]
    form_fill.expects(:merge_structure_with_data).returns(merged_data).at_least_once

    # Mock the PDF services to avoid actual PDF generation
    PdfFormsParserService.any_instance.stubs(:fill_form).returns('/tmp/output.pdf')
    PdfMergingService.any_instance.stubs(:merge).returns(mock_pdf_object)
    File.stubs(:exist?).returns(true)
    File.stubs(:size).returns(1000)
    FileUtils.stubs(:rm_f)
    mock_pdf_object.stubs(:save)

    # Mock file operations for PDF attachment
    File.stubs(:open).yields(StringIO.new('pdf content'))
    filled_pdf = mock('filled_pdf')
    filled_pdf.stubs(:attached?).returns(false)
    filled_pdf.stubs(:attach)
    form_fill.stubs(:filled_pdf).returns(filled_pdf)
    form_fill.stubs(:photos).returns([])

    # Perform the job
    GeneratePdfJob.perform_now(1)

    # The expectation on merge_structure_with_data will verify it was called
  end

  test 'should use merged data for deficiencies processing' do
    # Create test objects
    form_fill = FormFill.new(
      id: 1,
      form_structure: '[{"type": "Deficiency", "name": "def1", "value": "Major"}]',
      data: { 'def1' => 'Major' },
      pdf_generation_status: 'generating'
    )

    deficiencies_form_fill = FormFill.new(
      id: 2,
      form_structure: '[{"type": "Deficiency_field", "name": "def_field1"}]',
      data: { 'def_field1' => 'Processed' }
    )

    inspection = Inspection.new(id: 1)
    form_template = FormTemplate.new(name: 'Test Template')
    deficiencies_template = FormTemplate.new(name: 'Deficiencies')

    # Mock relationships
    form_fill.stubs(:inspection).returns(inspection)
    form_fill.stubs(:form_template).returns(form_template)
    form_fill.stubs(:generating?).returns(true)
    form_fill.stubs(:update!).returns(true)

    deficiencies_form_fill.stubs(:form_template).returns(deficiencies_template)

    FormFill.stubs(:find).with(1).returns(form_fill)
    FormTemplate.stubs(:find_by).with(name: 'Deficiencies').returns(deficiencies_template)

    # Mock form_fills association
    form_fills_relation = mock('form_fills_relation')
    form_fills_relation.stubs(:find_by).with(form_template: deficiencies_template).returns(deficiencies_form_fill)
    inspection.stubs(:form_fills).returns(form_fills_relation)

    # Mock file attachments
    original_file = mock('original_file')
    original_file.stubs(:attached?).returns(true)
    form_template.stubs(:original_file).returns(original_file)
    deficiencies_template.stubs(:original_file).returns(original_file)

    blob = mock('blob')
    tempfile = mock('tempfile')
    tempfile.stubs(:path).returns('/tmp/test.pdf')
    blob.stubs(:open).yields(tempfile)
    original_file.stubs(:blob).returns(blob)

    # Key test - ensure merge_structure_with_data is called on both form fills
    main_merged_data = [{ 'name' => 'def1', 'type' => 'Deficiency', 'value' => 'Major' }]
    deficiencies_merged_data = [{ 'name' => 'def_field1', 'type' => 'Deficiency_field', 'value' => 'Processed' }]

    form_fill.expects(:merge_structure_with_data).returns(main_merged_data).at_least_once
    deficiencies_form_fill.expects(:merge_structure_with_data).returns(deficiencies_merged_data).at_least_once

    # Mock services
    PdfFormsParserService.any_instance.stubs(:fill_form).returns('/tmp/output.pdf')
    PdfMergingService.any_instance.stubs(:merge).returns(mock_pdf_object)
    PdfMergingService.stubs(:add_images_to_pdf).returns(mock_pdf_object)
    File.stubs(:exist?).returns(true)
    File.stubs(:size).returns(1000)
    FileUtils.stubs(:rm_f)
    mock_pdf_object.stubs(:save)

    # Mock file operations
    File.stubs(:open).yields(StringIO.new('pdf content'))
    filled_pdf = mock('filled_pdf')
    filled_pdf.stubs(:attached?).returns(false)
    filled_pdf.stubs(:attach)
    form_fill.stubs(:filled_pdf).returns(filled_pdf)
    form_fill.stubs(:photos).returns([])

    # Perform the job
    GeneratePdfJob.perform_now(1)

    # The expectations will verify merge_structure_with_data was called
  end

  private

  def mock_pdf_object
    @mock_pdf_object ||= begin
      obj = Object.new
      obj.define_singleton_method(:save) { |path| true }
      obj
    end
  end
end
