# app/services/header_auto_filler_service.rb

class HeaderAutoFillerService
  def initialize(inspection)
    @inspection = inspection
    @property = inspection.property
    @contractor_info = ContractorInfo.first
    @license_info = LicenseInfo.first
  end

  def call
    Rails.logger.info "[HeaderAutoFillerService] STARTING for Inspection ##{@inspection.id}"

    unless @contractor_info && @license_info
      Rails.logger.warn '[HeaderAutoFillerService] ABORTING: ContractorInfo or LicenseInfo not found.'
      return
    end

    @inspection.form_fills.find_each do |form_fill|
      process_form_fill(form_fill)
    end
  end

  private

  def process_form_fill(form_fill)
    Rails.logger.info "[HeaderAutoFillerService] Processing FormFill ##{form_fill.id}"

    header_data = build_header_data(form_fill)

    if header_data.empty?
      Rails.logger.info "[HeaderAutoFillerService] No matching header fields found in FormFill ##{form_fill.id}. Nothing to update."
      return
    end

    Rails.logger.info "[HeaderAutoFillerService] Built header data for FormFill ##{form_fill.id}: #{header_data.inspect}"

    new_data = form_fill.data.merge(header_data)

    if form_fill.update(data: new_data)
      Rails.logger.info "[HeaderAutoFillerService] SUCCESS: Updated FormFill ##{form_fill.id}"
    else
      Rails.logger.error "[HeaderAutoFillerService] FAILED to update FormFill ##{form_fill.id}: #{form_fill.errors.full_messages.join(', ')}"
    end
  end

  def build_header_data(form_fill)
    structure = begin
      JSON.parse(form_fill.form_structure)
    rescue StandardError
      []
    end
    data_to_update = {}
    Rails.logger.info "[HeaderAutoFillerService] Parsing form structure for FormFill ##{form_fill.id} with #{structure.count} fields."

    structure.each do |field|
      # Fallback to 'name' if 'id' is missing (seen in Corrected Deficiencies form)
      field_id = field['id'] || field['name']
      next unless field['label_name'].present? && field_id.present?

      value = find_value_for_field(field)

      if value.present?
        Rails.logger.info "[HeaderAutoFillerService] MATCH: Found value for field id '#{field_id}' (Label: '#{field['label_name']}'). Assigning value: '#{value}'"
        data_to_update[field_id] = value
      end
    end

    data_to_update
  end

  def find_value_for_field(field)
    label = field['label_name'].downcase
    section = (field['section_name'] || '').downcase
    raw_value = nil

    # --- Lógica para la sección del Contratista ---
    if section.include?('contractor')
      raw_value ||= @inspection.try(:job) if label.include?('job')
      raw_value ||= @contractor_info.try(:name)    if label.include?('name')
      raw_value ||= @contractor_info.try(:address) if label.include?('address')
      raw_value ||= @contractor_info.try(:city)    if label.include?('city')
      raw_value ||= @contractor_info.try(:state)   if label.include?('st')
      raw_value ||= @contractor_info.try(:zip)     if label.include?('zip')
      raw_value ||= @contractor_info.try(:phone)   if label.include?('phone')
    end

    # --- Lógica para la sección de la Propiedad ---
    if section.include?('property')
      raw_value ||= @property.customer.try(:name)    if label.include?('contact')
      raw_value ||= @property.customer.try(:phone_1) if label.include?('phone')
      # Coincidencia exacta para la dirección para no llenar "Address 2"
      raw_value ||= @property.try(:address)       if ['property address', 'building address'].include?(label)
      raw_value ||= @property.try(:property_name) if label.include?('name')
      raw_value ||= @property.try(:city)          if label.include?('city')
      raw_value ||= @property.try(:state)         if label.include?('state')
    end

    # --- Lógica para la sección de Licencia ---
    if section.include?('license')
      raw_value ||= @license_info.try(:sfm)  if label == 'sfm'
      raw_value ||= @license_info.try(:cslb) if label == 'cslb'
      raw_value ||= @license_info.try(:license_number) if label.include?('license')
    end

    # --- Procesar el valor encontrado ---
    if raw_value == true
      options = field['options']
      return options.first if options.is_a?(Array) && options.first.present?

      return 'Yes'
    end

    raw_value
  end
end
