class ParseFormTemplateJob < ApplicationJob
  queue_as :default

  def perform(form_template_id)
    form_template = FormTemplate.find(form_template_id)
    return unless form_template&.original_file&.attached?

    # Descargar el archivo desde Active Storage a un archivo temporal
    form_template.original_file.blob.open do |tempfile|
      parser = PdfFormsParserService.new(tempfile.path)
      form_structure = parser.parse

      # Actualizar el registro con la estructura parseada
      form_template.update(form_structure: form_structure.to_json)
    end
  end
end
