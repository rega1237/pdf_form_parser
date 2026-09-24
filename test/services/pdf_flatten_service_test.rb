require "test_helper"
require "tempfile"

class PdfFlattenServiceTest < ActiveSupport::TestCase
  def setup
    @input_pdf_path = Rails.root.join("test", "fixtures", "files", "test.pdf").to_s
    @output_pdf = Tempfile.new([ "flattened", ".pdf" ])
  end

  def teardown
    @output_pdf.close
    @output_pdf.unlink
  end

  test "should flatten the given pdf successfully" do
    # Simulating pdftk being called by mocking PdfForms or checking if output is created.
    # Since we use PdfForms, let's mock it to ensure flatten is called with right args.

    pdftk_mock = mock("pdftk")
    PdfForms.expects(:new).with(utf8_fields: true).returns(pdftk_mock)

    pdftk_mock.expects(:call_pdftk).with(
      @input_pdf_path,
      "output",
      @output_pdf.path,
      "flatten"
    ).returns(true)

    result = PdfFlattenService.call(@input_pdf_path, @output_pdf.path)

    assert result, "Service should return true on success"
  end

  test "should raise or return false on error" do
    pdftk_mock = mock("pdftk")
    PdfForms.expects(:new).with(utf8_fields: true).returns(pdftk_mock)

    pdftk_mock.expects(:call_pdftk).raises(StandardError.new("PDFtk failed"))

    assert_raises(StandardError) do
      PdfFlattenService.call(@input_pdf_path, @output_pdf.path)
    end
  end
end
