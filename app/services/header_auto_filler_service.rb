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

    unless main_form_fill
      Rails.logger.warn "[HeaderAutoFillerService] ABORTING: Main FormFill not found for Inspection ##{@inspection.id}"
      return
    end

    unless @contractor_info && @license_info
      Rails.logger.warn '[HeaderAutoFillerService] ABORTING: ContractorInfo or LicenseInfo not found.'
      return
    end

    Rails.logger.info "[HeaderAutoFillerService] Found Main FormFill ##{main_form_fill.id}"

    header_data = build_header_data

    if header_data.empty?
      Rails.logger.warn '[HeaderAutoFillerService] No matching header fields found in form structure. Nothing to update.'
      return
    end

    Rails.logger.info "[HeaderAutoFillerService] Built header data: #{header_data.inspect}"

    new_data = main_form_fill.data.merge(header_data)
    Rails.logger.info "[HeaderAutoFillerService] Merged data for update: #{new_data.inspect}"

    if main_form_fill.update(data: new_data)
      Rails.logger.info "[HeaderAutoFillerService] SUCCESS: Updated FormFill ##{main_form_fill.id}"
    else
      Rails.logger.error "[HeaderAutoFillerService] FAILED to update FormFill ##{main_form_fill.id}: #{main_form_fill.errors.full_messages.join(', ')}"
    end
  end

  private

  def main_form_fill
    @main_form_fill ||= @inspection.form_fills.find_by(form_template_id: @inspection.form_template_id)
  end

  def build_header_data
    structure = begin
      JSON.parse(main_form_fill.form_structure)
    rescue StandardError
      []
    end
    data_to_update = {}
    Rails.logger.info "[HeaderAutoFillerService] Parsing form structure with #{structure.count} fields."

    structure.each do |field|
      next unless field['label_name'].present? && field['id'].present?

      value = find_value_for_field(field)

      if value.present?
        Rails.logger.info "[HeaderAutoFillerService] MATCH: Found value for field id '#{field['id']}' (Label: '#{field['label_name']}'). Assigning value: '#{value}'"
        data_to_update[field['id']] = value
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
