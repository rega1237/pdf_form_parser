class GeneratePdfJob < ApplicationJob
  queue_as :default

  def perform(form_fill_id)
    main_form_fill = FormFill.find(form_fill_id)
    inspection = main_form_fill.inspection
    inspection_date = inspection&.date

    unless main_form_fill.generating?
      Rails.logger.warn "FormFill ##{main_form_fill.id} is not in generating state. Current state: #{main_form_fill.pdf_generation_status}"
      return
    end

    deficiencies_template = FormTemplate.find_by(name: 'Deficiencies')
    deficiencies_form_fill = inspection.form_fills.find_by(form_template: deficiencies_template)

    unless inspection && main_form_fill.form_template.original_file.attached?
      Rails.logger.error "El template del PDF principal no se encuentra para FormFill ##{main_form_fill.id}."
      main_form_fill.update!(pdf_generation_status: 'failed')
      return
    end

    if deficiencies_form_fill && !deficiencies_form_fill.form_template.original_file.attached?
      Rails.logger.error "El template del PDF de deficiencias no se encuentra para la inspección ##{inspection.id}."
      main_form_fill.update!(pdf_generation_status: 'failed')
      return
    end

    begin
      all_fields = JSON.parse(main_form_fill.form_structure)
      data = main_form_fill.data || {}

      main_form_fields = all_fields.map do |field|
        field_copy = field.dup
        name = field_copy['name']
        next field_copy unless name.present?

        case field_copy['type']
        when 'Photo'
          field_copy['photo_attachment_id'] = data["#{name}_photo_attachment_id"]
        when 'Deficiency'
          field_copy['value'] = data["#{name}_select"]
          field_copy['comment_value'] = data["#{name}_comment"]
          field_copy['Item'] = data["#{name}_item"]
          field_copy['Riser'] = data["#{name}_riser"]
          field_copy['C'] = data["#{name}_c"]
          field_copy['D'] = data["#{name}_d"]
        else
          field_copy['value'] = data[name]
        end
        field_copy
      end

      deficiencies_with_data = main_form_fields.select do |f|
        f['type'] == 'Deficiency' &&
          (f['value'].present? || f['comment_value'].present? || f['Item'].present? || f['Riser'].present? || f['C'].present? || f['D'].present?)
      end

      main_processor = DeficiencyProcessorService.new(
        deficiencies_data: deficiencies_with_data,
        target_fields: main_form_fields.select { |f| f['type'] == 'Deficiency_field' },
        inspection_date: inspection_date
      )
      main_result = main_processor.process

      update_form_fields(main_form_fields, main_result[:processed_fields])
      main_pdf_path = generate_pdf_for(main_form_fill, main_form_fields)
      deficiencies_pdf_path = nil

      if main_result[:unprocessed_deficiencies].any? && deficiencies_form_fill
        # --- LOGS DE DEBUG: PROCESO DE DEFICIENCIAS SOBRANTES ---
        Rails.logger.info '--------------------------------------------------'
        Rails.logger.info '[PDF Job Debug] ==> Iniciando proceso para PDF de deficiencias sobrantes.'
        Rails.logger.info "[PDF Job Debug] Número de deficiencias sobrantes: #{main_result[:unprocessed_deficiencies].count}"
        Rails.logger.debug "[PDF Job Debug] Datos de deficiencias sobrantes: #{main_result[:unprocessed_deficiencies].inspect}"

        # Paso A: Cargar la estructura del PDF de deficiencias
        deficiencies_form_fields = JSON.parse(deficiencies_form_fill.form_structure)
        Rails.logger.info "[PDF Job Debug] Se cargaron #{deficiencies_form_fields.count} campos desde la plantilla del PDF de deficiencias."

        # Paso B: Preparar datos para el segundo procesador
        target_deficiency_fields = deficiencies_form_fields.select { |f| f['type'] == 'Deficiency_field' }
        Rails.logger.info "[PDF Job Debug] Se encontraron #{target_deficiency_fields.count} campos de destino tipo 'Deficiency_field' en la plantilla."

        deficiencies_processor = DeficiencyProcessorService.new(
          deficiencies_data: main_result[:unprocessed_deficiencies],
          target_fields: target_deficiency_fields,
          inspection_date: inspection_date
        )

        # Paso C: Ejecutar el segundo procesador
        deficiencies_result = deficiencies_processor.process
        Rails.logger.info "[PDF Job Debug] El segundo procesador mapeó #{deficiencies_result[:processed_fields].count} campos."
        Rails.logger.debug "[PDF Job Debug] Campos procesados por el segundo procesador: #{deficiencies_result[:processed_fields].inspect}"

        # Paso D: Actualizar los campos con los resultados
        update_form_fields(deficiencies_form_fields, deficiencies_result[:processed_fields])

        # Paso E: Generar el PDF
        deficiencies_pdf_path = generate_pdf_for(deficiencies_form_fill, deficiencies_form_fields)
        Rails.logger.info "[PDF Job Debug] PDF de deficiencias generado en: #{deficiencies_pdf_path}"
        Rails.logger.info '[PDF Job Debug] <== Proceso de deficiencias sobrantes finalizado.'
        Rails.logger.info '--------------------------------------------------'
        # --- FIN DE LOGS DE DEBUG ---
      end

      final_pdf_object = if main_pdf_path
                           merger = PdfMergingService.new(main_pdf_path, deficiencies_pdf_path)
                           merger.merge
                         end

      if final_pdf_object && main_form_fill.photos.attached?
        final_pdf_object = PdfMergingService.add_images_to_pdf(final_pdf_object, main_form_fill.photos)
      end

      if final_pdf_object
        final_pdf_path = Rails.root.join('tmp', "final_inspection_#{inspection.id}_#{Time.now.to_i}.pdf")
        final_pdf_object.save(final_pdf_path)

        if File.exist?(final_pdf_path) && File.size(final_pdf_path) > 0
          main_form_fill.filled_pdf.purge if main_form_fill.filled_pdf.attached?
          File.open(final_pdf_path, 'rb') do |file|
            main_form_fill.filled_pdf.attach(
              io: file,
              filename: "#{inspection.property['property_name']}_#{inspection.id}_#{Time.now.to_i}.pdf",
              content_type: 'application/pdf'
            )
          end
          main_form_fill.update!(pdf_generation_status: 'completed')
          Rails.logger.info "PDF generado exitosamente para FormFill ##{main_form_fill.id}."
        else
          main_form_fill.update!(pdf_generation_status: 'failed')
          Rails.logger.error "Error: El archivo PDF no se generó correctamente para FormFill ##{main_form_fill.id}"
        end

        FileUtils.rm_f([main_pdf_path, deficiencies_pdf_path, final_pdf_path].compact)
      else
        main_form_fill.update!(pdf_generation_status: 'failed')
        Rails.logger.error "No se pudo generar el PDF final para FormFill ##{main_form_fill.id}"
      end
    rescue JSON::ParserError => e
      main_form_fill.update!(pdf_generation_status: 'failed')
      Rails.logger.error "Error procesando la estructura del formulario en el Job para FormFill ##{main_form_fill.id}: #{e.message}"
    rescue StandardError => e
      main_form_fill.update!(pdf_generation_status: 'failed')
      Rails.logger.error "Error en GeneratePdfJob para FormFill ##{main_form_fill.id}: #{e.message}\n#{e.backtrace.join("\n")}"
    end
  end

  private

  def generate_pdf_for(form_fill, processed_fields)
    output_path = nil
    form_fill.form_template.original_file.blob.open do |template_tempfile|
      pdf_service = PdfFormsParserService.new(template_tempfile.path)
      output_filename = "#{form_fill.name.parameterize}_#{Time.now.to_i}.pdf"
      output_path = Rails.root.join('tmp', output_filename)
      pdf_service.fill_form(output_path, processed_fields)
    end
    output_path
  end

  def update_form_fields(original_fields, processed_fields)
    processed_map = processed_fields.index_by { |f| f['name'] }
    original_fields.each do |field|
      field['value'] = processed_map[field['name']]['value'] if processed_map.key?(field['name'])
    end
  end
end
