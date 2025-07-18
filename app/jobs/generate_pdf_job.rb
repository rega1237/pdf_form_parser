class GeneratePdfJob < ApplicationJob
  queue_as :default

  def perform(form_fill_id)
    main_form_fill = FormFill.find(form_fill_id)
    inspection = main_form_fill.inspection

    # Verificar que el estado sea 'generating'
    unless main_form_fill.generating?
      Rails.logger.warn "FormFill ##{main_form_fill.id} is not in generating state. Current state: #{main_form_fill.pdf_generation_status}"
      return
    end

    # 1. Encontrar el formulario de deficiencias asociado.
    deficiencies_template = FormTemplate.find_by(name: 'Deficiencies')
    deficiencies_form_fill = inspection.form_fills.find_by(form_template: deficiencies_template)

    # 2. Validar que las plantillas de PDF estén presentes.
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
      # 3. Procesar el formulario principal para extraer las deficiencias.
      main_form_fields = JSON.parse(main_form_fill.form_structure)
      deficiencies_with_data = main_form_fields.select do |f|
        f['type'] == 'Deficiency' && (f['value'].present? || f['comment_value'].present?)
      end

      main_processor = DeficiencyProcessorService.new(
        deficiencies_data: deficiencies_with_data,
        target_fields: main_form_fields.select { |f| f['type'] == 'Deficiency_field' }
      )
      main_result = main_processor.process

      update_form_fields(main_form_fields, main_result[:processed_fields])

      # Generar el PDF principal y guardar su ruta temporal.
      main_pdf_path = generate_pdf_for(main_form_fill, main_form_fields)
      deficiencies_pdf_path = nil

      # 4. Procesar y generar el PDF de deficiencias si hay sobrantes.
      if main_result[:unprocessed_deficiencies].any? && deficiencies_form_fill
        deficiencies_form_fields = JSON.parse(deficiencies_form_fill.form_structure)
        deficiencies_processor = DeficiencyProcessorService.new(
          deficiencies_data: main_result[:unprocessed_deficiencies],
          target_fields: deficiencies_form_fields.select { |f| f['type'] == 'Deficiency_field' }
        )
        deficiencies_result = deficiencies_processor.process

        update_form_fields(deficiencies_form_fields, deficiencies_result[:processed_fields])
        deficiencies_pdf_path = generate_pdf_for(deficiencies_form_fill, deficiencies_form_fields)
      end

      # 5. Cargar el PDF principal o unirlo con el de deficiencias.
      final_pdf_object = if main_pdf_path
                           merger = PdfMergingService.new(main_pdf_path, deficiencies_pdf_path)
                           merger.merge
                         end

      # 6. Adjuntar las fotos al final del PDF resultante.
      if final_pdf_object && main_form_fill.photos.attached?
        final_pdf_object = PdfMergingService.add_images_to_pdf(final_pdf_object, main_form_fill.photos)
      end

      # 7. Guardar el PDF final y adjuntarlo al registro.
      if final_pdf_object
        final_pdf_path = Rails.root.join('tmp', "final_inspection_#{inspection.id}_#{Time.now.to_i}.pdf")
        final_pdf_object.save(final_pdf_path)

        # Verificar que el archivo se guardó correctamente
        if File.exist?(final_pdf_path) && File.size(final_pdf_path) > 0
          # Si ya existe un PDF anterior, eliminarlo antes de adjuntar el nuevo
          if main_form_fill.filled_pdf.attached?
            Rails.logger.info "Eliminando PDF anterior para FormFill ##{main_form_fill.id}"
            main_form_fill.filled_pdf.purge
          end

          # Adjuntar el nuevo PDF
          File.open(final_pdf_path, 'rb') do |file|
            main_form_fill.filled_pdf.attach(
              io: file,
              filename: "inspeccion_final_#{inspection.id}_#{Time.now.to_i}.pdf",
              content_type: 'application/pdf'
            )
          end

          # Marcar como completado exitosamente
          main_form_fill.update!(pdf_generation_status: 'completed')
          Rails.logger.info "PDF generado exitosamente para FormFill ##{main_form_fill.id}."
        else
          # Marcar como fallido si el archivo no se generó correctamente
          main_form_fill.update!(pdf_generation_status: 'failed')
          Rails.logger.error "Error: El archivo PDF no se generó correctamente para FormFill ##{main_form_fill.id}"
        end

        # 8. Limpiar todos los archivos temporales.
        FileUtils.rm_f([main_pdf_path, deficiencies_pdf_path, final_pdf_path].compact)
      else
        # Si no se pudo generar el PDF final
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
