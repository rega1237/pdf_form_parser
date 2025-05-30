# app/services/pdf_forms_parser_service.rb
require 'pdf-forms'
require 'pdf-reader' # Add this line

class PdfFormsParserService
  def initialize(file_path)
    @pdftk = PdfForms.new # Assumes pdftk is in PATH, or specify path
    @file_path = file_path
  end

  def parse
    raw_fields = @pdftk.get_fields(@file_path)

    form_structure = raw_fields.map do |field|
      {
        name: field.name,
        type: field.type, # e.g., "Text", "Button", "Choice"
        value: field.value,
        options: field.options, # For 'Choice' type
      }
    end
    form_structure
  rescue PdfForms::PdftkError => e
    Rails.logger.error "PdftkError while parsing #{@file_path}: #{e.message}"
    [] # Return empty array or handle error as appropriate
  rescue PDF::Reader::MalformedPDFError => e
    Rails.logger.error "MalformedPDFError while reading #{@file_path}: #{e.message}"
    # Fallback to parsing without labels if reader fails
    raw_fields.map do |field|
      {
        name: field.name,
        type: field.type,
        value: field.value,
        options: field.options,
        human_label: field.name&.humanize # Fallback
      }
    end
  end
end