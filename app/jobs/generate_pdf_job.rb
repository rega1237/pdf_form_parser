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

    unless main_form_fill.main_form_fill?
      Rails.logger.error "FormFill ##{main_form_fill.id} is not the main form fill for the inspection."
      main_form_fill.update!(pdf_generation_status: 'failed')
      return
    end

    begin
      # Collect all deficiencies from main form and additional risers
      all_deficiencies = collect_all_deficiencies(inspection)

      # Process main form with all deficiencies
      main_pdf_path = generate_main_form_pdf(main_form_fill, all_deficiencies, inspection_date)

      # Generate deficiencies PDF ONLY if there are unprocessed deficiencies
      deficiencies_pdf_path = nil
      if @unprocessed_deficiencies&.any?
        Rails.logger.info "Generating deficiencies PDF for #{@unprocessed_deficiencies.count} unprocessed deficiencies"
        deficiencies_pdf_path = generate_deficiencies_pdf_if_needed(inspection, all_deficiencies, inspection_date)
      else
        Rails.logger.info 'No unprocessed deficiencies found. Skipping deficiencies PDF generation.'
      end

      # Collect individual PDFs that should be merged
      individual_pdfs = collect_individual_pdfs_for_merge(inspection)

      # Merge all PDFs
      final_pdf_object = merge_all_pdfs(main_pdf_path, deficiencies_pdf_path, individual_pdfs)

      # Add photos if any
      if final_pdf_object && main_form_fill.photos.attached?
        final_pdf_object = PdfMergingService.add_images_to_pdf(final_pdf_object, main_form_fill.photos)
      end

      # Save final PDF
      if final_pdf_object
        save_final_pdf(main_form_fill, final_pdf_object, inspection)
        main_form_fill.mark_pdf_created!
        Rails.logger.info "Complete inspection PDF generated successfully for FormFill ##{main_form_fill.id}."
      else
        main_form_fill.update!(pdf_generation_status: 'failed')
        Rails.logger.error "Failed to generate complete inspection PDF for FormFill ##{main_form_fill.id}"
      end

      # Clean up temporary files
      cleanup_temp_files([main_pdf_path, deficiencies_pdf_path])
    rescue StandardError => e
      main_form_fill.update!(pdf_generation_status: 'failed')
      Rails.logger.error "Error in GeneratePdfJob for FormFill ##{main_form_fill.id}: #{e.message}\n#{e.backtrace.join("\n")}"
    end
  end

  private

  def collect_all_deficiencies(inspection)
    all_deficiencies = []

    # Get deficiencies from main form
    main_form_fill = inspection.form_fills.find_by(form_template_id: inspection.form_template_id)
    if main_form_fill
      main_deficiencies = main_form_fill.get_deficiencies_for_processing
      all_deficiencies.concat(main_deficiencies)
      Rails.logger.info "Collected #{main_deficiencies.count} deficiencies from main form"
    end

    # Get deficiencies from additional risers if it has PDF created
    additional_risers_form_fill = inspection.form_fills.joins(:form_template).find_by(form_templates: { name: 'Additional Risers' })
    if additional_risers_form_fill&.pdf_created?
      additional_deficiencies = additional_risers_form_fill.get_deficiencies_for_processing
      all_deficiencies.concat(additional_deficiencies)
      Rails.logger.info "Collected #{additional_deficiencies.count} deficiencies from additional risers"
    end

    Rails.logger.info "Total deficiencies collected: #{all_deficiencies.count}"
    all_deficiencies
  end

  def generate_main_form_pdf(main_form_fill, all_deficiencies, inspection_date)
    all_fields = JSON.parse(main_form_fill.form_structure)
    data = main_form_fill.data || {}

    # Merge data into fields (same logic as before)
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

    # Process deficiencies using all collected deficiencies
    target_fields = main_form_fields.select { |f| f['type'] == 'Deficiency_field' }
    main_processor = DeficiencyProcessorService.new(
      deficiencies_data: all_deficiencies,
      target_fields: target_fields,
      inspection_date: inspection_date
    )
    main_result = main_processor.process

    update_form_fields(main_form_fields, main_result[:processed_fields])

    # Store unprocessed deficiencies for deficiencies PDF
    @unprocessed_deficiencies = main_result[:unprocessed_deficiencies]

    Rails.logger.info "Main form processed #{main_result[:processed_fields].count} fields, #{@unprocessed_deficiencies.count} deficiencies remain unprocessed"

    generate_pdf_for(main_form_fill, main_form_fields)
  end

  def generate_deficiencies_pdf_if_needed(inspection, all_deficiencies, inspection_date)
    return nil unless @unprocessed_deficiencies&.any?

    deficiencies_template = FormTemplate.find_by(name: 'Deficiencies')
    deficiencies_form_fill = inspection.form_fills.find_by(form_template: deficiencies_template)

    return nil unless deficiencies_form_fill && deficiencies_form_fill.form_template.original_file.attached?

    deficiencies_form_fields = JSON.parse(deficiencies_form_fill.form_structure)
    target_deficiency_fields = deficiencies_form_fields.select { |f| f['type'] == 'Deficiency_field' }

    deficiencies_processor = DeficiencyProcessorService.new(
      deficiencies_data: @unprocessed_deficiencies,
      target_fields: target_deficiency_fields,
      inspection_date: inspection_date
    )

    deficiencies_result = deficiencies_processor.process
    update_form_fields(deficiencies_form_fields, deficiencies_result[:processed_fields])

    generate_pdf_for(deficiencies_form_fill, deficiencies_form_fields)
  end

  def collect_individual_pdfs_for_merge(inspection)
    individual_pdfs = []

    # Check for Additional Risers PDF
    additional_risers_form_fill = inspection.form_fills.joins(:form_template).find_by(form_templates: { name: 'Additional Risers' })
    if additional_risers_form_fill&.should_include_in_main_merge?
      individual_pdfs << additional_risers_form_fill.filled_pdf
      Rails.logger.info 'Including Additional Risers PDF in merge'
    end

    # Check for Corrected Deficiencies PDF (updated name)
    corrections_form_fill = inspection.form_fills.joins(:form_template).find_by(form_templates: { name: 'Corrected Deficiencies' })
    if corrections_form_fill&.should_include_in_main_merge?
      individual_pdfs << corrections_form_fill.filled_pdf
      Rails.logger.info 'Including Corrected Deficiencies PDF in merge'
    end

    individual_pdfs
  end

  def merge_all_pdfs(main_pdf_path, deficiencies_pdf_path, individual_pdfs)
    merger = PdfMergingService.new(main_pdf_path, deficiencies_pdf_path)
    final_pdf = merger.merge

    # Add individual PDFs to the merge
    individual_pdfs.each do |pdf_attachment|
      next unless pdf_attachment.attached?

      pdf_attachment.blob.open do |tempfile|
        individual_pdf = CombinePDF.load(tempfile.path)
        final_pdf << individual_pdf
        Rails.logger.info "Added individual PDF to merge: #{pdf_attachment.filename}"
      end
    end

    final_pdf
  end

  def save_final_pdf(main_form_fill, final_pdf_object, inspection)
    final_pdf_path = Rails.root.join('tmp', "complete_inspection_#{inspection.id}_#{Time.now.to_i}.pdf")
    final_pdf_object.save(final_pdf_path)

    if File.exist?(final_pdf_path) && File.size(final_pdf_path) > 0
      main_form_fill.filled_pdf.purge if main_form_fill.filled_pdf.attached?
      File.open(final_pdf_path, 'rb') do |file|
        main_form_fill.filled_pdf.attach(
          io: file,
          filename: "complete_inspection_#{inspection.property['property_name']}_#{inspection.id}_#{Time.now.to_i}.pdf",
          content_type: 'application/pdf'
        )
      end
      FileUtils.rm_f(final_pdf_path)
      true
    else
      false
    end
  end

  def cleanup_temp_files(file_paths)
    file_paths.compact.each { |path| FileUtils.rm_f(path) }
  end

  # Keep existing helper methods
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
