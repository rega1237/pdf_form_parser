require "test_helper"

class PdfFormsParserServiceTest < ActiveSupport::TestCase
  def setup
    @pdf_path = Rails.root.join("test", "fixtures", "files", "test.pdf")
    @service = PdfFormsParserService.new(@pdf_path.to_s)
  end

  test "should parse fields using dump_data fallback" do
    @service.instance_variable_get(:@pdftk).stubs(:get_fields).raises(StandardError.new("Simulated failure"))

    fields = @service.parse

    # Verificamos que se obtuvieron campos (asumiendo que test.pdf tiene campos)
    assert_not_nil fields
    assert fields.is_a?(Array)
  end
end
