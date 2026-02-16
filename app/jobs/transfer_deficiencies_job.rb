class TransferDeficienciesJob < ApplicationJob
  queue_as :default

  def perform(inspection_id)
    inspection = Inspection.find_by(id: inspection_id)
    return unless inspection

    Rails.logger.info "Starting TransferDeficienciesJob for Inspection ##{inspection.id}"

    # 1. Collect all deficiencies from relevant forms
    all_deficiencies = collect_all_deficiencies(inspection)

    if all_deficiencies.empty?
      Rails.logger.info "No deficiencies found for Inspection ##{inspection.id}. Job finished."
      return
    end

    # 2. Find or create the 'Corrected Deficiencies' form fill
    corrections_template = FormTemplate.find_by(name: "Corrected Deficiencies")
    unless corrections_template
      Rails.logger.error "FormTemplate 'Corrected Deficiencies' not found."
      return
    end

    corrections_form_fill = inspection.form_fills.find_or_create_by(form_template: corrections_template) do |ff|
      ff.name = "#{inspection.property&.property_name} - Corrected Deficiencies"
      ff.form_structure = corrections_template.form_structure
      ff.inspection = inspection
    end

    # 3. Prepare target fields from the corrections form structure
    form_structure = JSON.parse(corrections_form_fill.form_structure)

    # We are looking for fields in sections like "Corrective Action Performed row X"
    # These fields usually have types like 'Text', 'Date' etc, not necessarily 'Deficiency_field' types
    # but the service uses field metadata to map.
    # Based on the user request, we want to target sections.

    target_fields = form_structure.select do |field|
      section_name = field["section_name"].to_s
      section_name.match?(/Corrective Action Performed row \d+/i)
    end

    if target_fields.empty?
      Rails.logger.warn "No target fields found in 'Corrected Deficiencies' form structure for Inspection ##{inspection.id}"
      return
    end

    # 4. Use DeficiencyProcessorService to map deficiencies to target fields
    processor = DeficiencyProcessorService.new(
      deficiencies_data: all_deficiencies,
      target_fields: target_fields,
      inspection_date: inspection.date,
      strict_date_mode: true
    )

    result = processor.process
    processed_fields = result[:processed_fields]

    # 5. Update form data
    current_data = corrections_form_fill.data || {}
    updated_data = current_data.dup

    processed_fields.each do |field|
      updated_data[field["name"]] = field["value"]
    end

    corrections_form_fill.data = updated_data
    if corrections_form_fill.save
      Rails.logger.info "Successfully transferred #{processed_fields.count} fields to Corrected Deficiencies form for Inspection ##{inspection.id}"
    else
      Rails.logger.error "Failed to save Corrected Deficiencies form for Inspection ##{inspection.id}: #{corrections_form_fill.errors.full_messages.join(', ')}"
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
    end

    # Get deficiencies from additional risers
    additional_risers_form_fill = inspection.form_fills.joins(:form_template).find_by(form_templates: { name: "Additional Risers" })
    if additional_risers_form_fill
      additional_deficiencies = additional_risers_form_fill.get_deficiencies_for_processing
      all_deficiencies.concat(additional_deficiencies)
    end

    all_deficiencies
  end
end
