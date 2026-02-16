class DeficiencyProcessorService
  def initialize(deficiencies_data:, target_fields:, inspection_date: nil)
    @deficiencies_data = deficiencies_data || []
    @target_fields = target_fields || []
    @inspection_date = inspection_date
    @processed_fields = []
    @unprocessed_deficiencies = []
  end

  def process
    # Only process if we have actual deficiencies with meaningful data
    valid_deficiencies = @deficiencies_data.select do |deficiency|
      has_meaningful_data?(deficiency)
    end

    Rails.logger.info "Processing #{valid_deficiencies.count} valid deficiencies out of #{@deficiencies_data.count} total"

    deficiency_field_groups = group_target_fields_by_section
    sorted_group_keys = deficiency_field_groups.keys.sort_by { |name| name.scan(/\d+/).first.to_i }

    valid_deficiencies.each_with_index do |deficiency, index|
      next unless deficiency.is_a?(Hash) && deficiency["name"].present?

      if index < sorted_group_keys.length
        target_group_key = sorted_group_keys[index]
        target_group = deficiency_field_groups[target_group_key]

        process_single_deficiency(deficiency, target_group)
      else
        @unprocessed_deficiencies << deficiency
      end
    end

    {
      processed_fields: @processed_fields,
      unprocessed_deficiencies: @unprocessed_deficiencies
    }
  end

  private

  # Check if a deficiency has meaningful data (not just empty strings)
  def has_meaningful_data?(deficiency)
    return false unless deficiency.is_a?(Hash)

    meaningful_fields = [
      deficiency["value"],
      deficiency["comment_value"],
      deficiency["Item"],
      deficiency["Riser"],
      deficiency["C"],
      deficiency["D"]
    ]

    # Check if any field has actual content (not just empty or whitespace)
    meaningful_fields.any? { |field| field.present? && field.to_s.strip.present? }
  end

  def group_target_fields_by_section
    valid_fields = @target_fields.select { |field| field.is_a?(Hash) && field["section_name"].present? }
    valid_fields.group_by { |field| field["section_name"] }
  end

  def process_single_deficiency(deficiency, target_group)
    formatted_date = get_formatted_date

    unified_dc_field = target_group.find do |f|
      name_down = f["name"].to_s.downcase
      label_down = f["label_name"].to_s.downcase
      name_down.include?("cbdorc") || label_down.include?("cbdorc") || name_down == "defdc" || label_down == "defdc" || name_down.include?("defdorc") || label_down.include?("defdorc")
    end

    if unified_dc_field
      Rails.logger.debug "  [Lógica] Se detectó un campo unificado D/C: '#{unified_dc_field['name']}'"
    else
      Rails.logger.debug "  [L\u00F3gica] No se encontr\u00F3 campo unificado D/C. Se procesar\u00E1n D y C por separado."
    end

    if unified_dc_field
      if deficiency["D"] == "Yes"
        add_processed_field(unified_dc_field, "Choice1", deficiency["name"])
      elsif deficiency["C"] == "Yes"
        add_processed_field(unified_dc_field, "Choice2", deficiency["name"])
      end

      target_group.each do |field|
        next if field == unified_dc_field

        value_to_set = map_standard_fields(field, deficiency, formatted_date)
        add_processed_field(field, value_to_set, deficiency["name"]) if value_to_set.present?
      end
    else
      target_group.each do |field|
        value_to_set = map_standard_fields(field, deficiency, formatted_date)
        add_processed_field(field, value_to_set, deficiency["name"]) if value_to_set.present?
      end
    end
  end

  def map_standard_fields(field, deficiency, formatted_date)
    label_name = field["label_name"].to_s.downcase.strip

    Rails.logger.debug "    [Mapeo] Intentando mapear campo del PDF: '#{field['name']}' (Label: '#{label_name}')"

    case label_name
    when /^date/
      # Only set date if there's actual deficiency data to go with it
      if has_deficiency_content?(deficiency)
        formatted_date
      else
        nil # Don't set date for empty deficiencies
      end
    when /deficien/
      deficiency_text = "#{deficiency['value'].presence}  #{deficiency['comment_value']}"
      deficiency_text.strip.present? ? deficiency_text : nil
    when /^item/
      deficiency["Item"].present? ? deficiency["Item"] : nil
    when /^riser/
      deficiency["Riser"].present? ? deficiency["Riser"] : nil
    when /^form/
      "AES 19"
    when /\Ad\d*\z/
      deficiency["D"] == "Yes" ? "X" : nil
    when /\Ac\d*\z/
      deficiency["C"] == "Yes" ? "X" : nil
    else
      nil
    end
  end

  # Check if deficiency has actual content beyond just checkboxes
  def has_deficiency_content?(deficiency)
    content_fields = [
      deficiency["value"],
      deficiency["comment_value"],
      deficiency["Item"],
      deficiency["Riser"]
    ]

    checkbox_fields = [ deficiency["C"], deficiency["D"] ]

    # Has content if there's text in content fields OR checkboxes are checked
    content_fields.any? { |field| field.present? && field.to_s.strip.present? } ||
      checkbox_fields.any? { |field| field == "Yes" }
  end

  def add_processed_field(field, value, source_deficiency_name)
    sanitized_value = sanitize_for_pdf(value)
    processed_field = field.dup
    processed_field["value"] = sanitized_value
    @processed_fields << processed_field
    Rails.logger.info "  -> Mapeo desde '#{source_deficiency_name}': El campo '#{field['name']}' se llenará con '#{sanitized_value}'."
  end

  def sanitize_for_pdf(text)
    return text unless text.is_a?(String)

    text.gsub(/[\u201c\u201d]/, '"')  # Smart double quotes
        .gsub(/[\u2018\u2019]/, "'")  # Smart single quotes
        .gsub(/\u2013/, "-")          # En dash
        .gsub(/\u2014/, "-")          # Em dash
  end

  def get_formatted_date
    # Use inspection date if available, otherwise fall back to current date
    date_to_use = @inspection_date || Date.current

    # Format as MM/DD/YY (abbreviated year)
    date_to_use.strftime("%m/%d/%y")
  end
end
