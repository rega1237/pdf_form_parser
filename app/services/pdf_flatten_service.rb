require "pdf-forms"

class PdfFlattenService
  def self.call(input_path, output_path)
    pdftk = PdfForms.new(utf8_fields: true)

    # Run the pdftk command directly for flattening:
    # pdftk input.pdf output output.pdf flatten
    pdftk.call_pdftk(input_path, "output", output_path, "flatten")
    true
  end
end
