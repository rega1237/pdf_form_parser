class GenerateIndividualPdfJob < ApplicationJob
  queue_as :default

  def perform(form_fill_id)
    form_fill = FormFill.find(form_fill_id)

    unless form_fill.generating?
      Rails.logger.warn "FormFill ##{form_fill.id} is not in generating state. Current state: #{form_fill.pdf_generation_status}"
      return
    end

    unless form_fill.form_template.original_file.attached?
      Rails.logger.error "Template PDF not found for FormFill ##{form_fill.id}."
      form_fill.update!(pdf_generation_status: "failed")
      return
    end

    begin
      # Get form fields with data merged (without deficiency processing)
      form_fields = get_form_fields_with_data(form_fill)

      # Generate PDF
      pdf_path = generate_individual_pdf(form_fill, form_fields)

      if pdf_path && File.exist?(pdf_path) && File.size(pdf_path) > 0
        # Attach PDF to form fill
        attach_pdf_to_form_fill(form_fill, pdf_path)

        # Mark as PDF created
        form_fill.mark_pdf_created!

        Rails.logger.info "Individual PDF generated successfully for FormFill ##{form_fill.id}."
      else
        form_fill.update!(pdf_generation_status: "failed")
        Rails.logger.error "Failed to generate individual PDF for FormFill ##{form_fill.id}"
      end

      # Clean up temporary file
      FileUtils.rm_f(pdf_path) if pdf_path
    rescue StandardError, NoMemoryError => e
      form_fill.update!(pdf_generation_status: "failed")
      Rails.logger.error "Error in GenerateIndividualPdfJob for FormFill ##{form_fill.id}: #{e.message}\n#{e.backtrace.join("\n")}"
    end
  end

  private

  def get_form_fields_with_data(form_fill)
    all_fields = JSON.parse(form_fill.form_structure)
    data = form_fill.data || {}

    all_fields.flat_map do |field|
      field_copy = field.dup
      name = field_copy["name"]
      next [ field_copy ] unless name.present?

      case field_copy["type"]
      when "Photo"
        field_copy["photo_attachment_id"] = data["#{name}_photo_attachment_id"]
        [ field_copy ]
      when "Deficiency"
        # Nuevo soporte para Multi-Deficiencies
        collection_json = data["#{name}_collection"]

        if collection_json.present?
          begin
            collection = JSON.parse(collection_json)
            if collection.is_a?(Array) && collection.any?
              # Mapear cada deficiencia de la colección a una copia del campo original
              collection.map do |deficiency_data|
                new_field = field.dup
                # Asignar valores desde el objeto de la colección
                new_field["value"] = deficiency_data["value"]
                new_field["comment_value"] = deficiency_data["comment_value"]
                new_field["Item"] = deficiency_data["Item"]
                new_field["Riser"] = deficiency_data["Riser"]
                new_field["C"] = deficiency_data["C"]
                new_field["D"] = deficiency_data["D"]
                new_field
              end
            else
              # Array vacío o inválido, retornar campo vacío
              [ field_copy ]
            end
          rescue JSON::ParserError => e
            Rails.logger.warn "Error parsing deficiency collection for #{name}: #{e.message}"
            # Fallback a comportamiento antiguo si falla el parsing
            field_copy["value"] = data["#{name}_select"]
            field_copy["comment_value"] = data["#{name}_comment"]
            field_copy["Item"] = data["#{name}_item"]
            field_copy["Riser"] = data["#{name}_riser"]
            field_copy["C"] = data["#{name}_c"]
            field_copy["D"] = data["#{name}_d"]
            [ field_copy ]
          end
        else
          # Fallback para datos antiguos planos (si los hubiera) o campo vacío
          field_copy["value"] = data["#{name}_select"]
          field_copy["comment_value"] = data["#{name}_comment"]
          field_copy["Item"] = data["#{name}_item"]
          field_copy["Riser"] = data["#{name}_riser"]
          field_copy["C"] = data["#{name}_c"]
          field_copy["D"] = data["#{name}_d"]
          [ field_copy ]
        end
      else
        field_copy["value"] = data[name]
        [ field_copy ]
      end
    end
  end

  def generate_individual_pdf(form_fill, form_fields)
    output_path = nil

    # Preparar imágenes de firma para campos de firma
    signature_image_tempfiles = []
    # Tipos de firma permitidos por defecto
    allowed_signature_types = [ "Signature", "Signature_Field" ]
    # Caso especial: en "Corrected Deficiencies" también estampar "Signature_Annex" directamente en el campo
    begin
      template_name = form_fill.form_template&.name.to_s
      if template_name.strip == "Corrected Deficiencies"
        allowed_signature_types << "Signature_Annex"
      end
    rescue StandardError => e
      Rails.logger.warn "No se pudo determinar el nombre del template para habilitar firmas annex: #{e.message}"
    end

    form_fields.each do |field|
      next unless field.is_a?(Hash)

      type = field["type"].to_s
      next unless allowed_signature_types.include?(type)

      field_name = field["name"]
      begin
        signature_attachment = form_fill.get_signature_for_field(field_name)
        if signature_attachment.present?
          signature_attachment.blob.open do |blob_tempfile|
            ext = File.extname(signature_attachment.filename.to_s).presence || ".png"
            tf = Tempfile.create([ "signature_#{field_name}", ext ])
            tf.binmode
            FileUtils.cp(blob_tempfile.path, tf.path)
            tf.flush
            signature_image_tempfiles << tf
            field["signature_image_path"] = tf.path
            # Si el campo es de tipo Signature_Annex y está permitido (p.ej., Corrected Deficiencies),
            # tratarlo como Signature_Field para que PdfFormsParserService lo procese como solicitud de firma.
            if type == "Signature_Annex"
              field["type"] = "Signature_Field"
              Rails.logger.info "Tratando campo annex '#{field_name}' como Signature_Field para estampar firma (individual)."
            end
            Rails.logger.info "Asignada imagen de firma para campo '#{field_name}' (individual): #{tf.path}"
          end
        else
          Rails.logger.warn "Imagen de firma no encontrada para campo '#{field_name}' en FormFill ##{form_fill.id} (individual)"
        end
      rescue StandardError => e
        Rails.logger.error "Error preparando imagen de firma (individual) para campo '#{field_name}': #{e.message}"
      end
    end

    begin
      form_fill.form_template.original_file.blob.open do |template_tempfile|
        pdf_service = PdfFormsParserService.new(template_tempfile.path)
        output_filename = "#{form_fill.name.parameterize}_#{Time.now.to_i}.pdf"
        output_path = Rails.root.join("tmp", output_filename)
        pdf_service.fill_form(output_path, form_fields)
      end
      # No anexos de firma de cliente en PDFs individuales.
      # Los anexos (página extra con firma del cliente) solo se agregan
      # cuando se genera el PDF completo desde el formulario principal.
      output_path
    ensure
      signature_image_tempfiles.each do |tf|
        begin
          tf.close!
        rescue StandardError
          FileUtils.rm_f(tf.path) if tf.path
        end
      end
    end
  end

  # Recolecta firmas de cliente configuradas como anexos en el formulario
  def collect_annex_signatures(form_fill)
    return [] unless form_fill&.form_structure.present?

    fields = JSON.parse(form_fill.form_structure)
    annex_fields = fields.select { |f| f["type"].to_s == "Signature_Annex" }

    annex_fields.filter_map do |f|
      form_fill.get_signature_for_field(f["name"])
    end
  end

  def attach_pdf_to_form_fill(form_fill, pdf_path)
    form_fill.filled_pdf.purge if form_fill.filled_pdf.attached?

    File.open(pdf_path, "rb") do |file|
      form_fill.filled_pdf.attach(
        io: file,
        filename: "#{form_fill.name.parameterize}_#{Time.now.to_i}.pdf",
        content_type: "application/pdf"
      )
    end
  end
end
