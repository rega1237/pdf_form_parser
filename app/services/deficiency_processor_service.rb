require 'set'

class DeficiencyProcessorService
  def initialize(form_fields)
    @form_fields = form_fields
    @processed_fields = []
  end

  def process_deficiencies
    # 1. Obtener deficiencias con datos
    deficiencies_with_data = get_deficiencies_with_data

    # 2. Obtener campos deficiency_field agrupados por section_name
    deficiency_field_groups = get_deficiency_field_groups

    # 3. Obtener fecha por defecto si existe
    default_date = get_default_date

    # DEBUG: Mostrar información de mapeo
    Rails.logger.info '=== DEBUG DEFICIENCIES ==='
    Rails.logger.info "Deficiencias con datos encontradas: #{deficiencies_with_data.length}"
    deficiencies_with_data.each_with_index do |def_field, i|
      has_value = def_field['value'].present? && def_field['value'].strip != ''
      has_comment = def_field['comment_value'].present? && def_field['comment_value'].strip != ''
      reason = []
      reason << "value: '#{def_field['value']}'" if has_value
      reason << "comment: '#{def_field['comment_value']}'" if has_comment

      Rails.logger.info "  #{i}: #{def_field['name']} (section: '#{def_field['section_name']}') - Incluida por: #{reason.join(', ')}"
    end

    Rails.logger.info "Grupos de deficiency_field: #{deficiency_field_groups.keys}"
    Rails.logger.info '=== END DEBUG ==='

    # 4. Procesar cada deficiencia con mapeo inteligente
    process_deficiencies_with_smart_mapping(deficiencies_with_data, deficiency_field_groups, default_date)

    # 5. Retornar campos procesados
    @form_fields.map do |field|
      if field['type'] == 'Deficiency_field'
        # Buscar si este campo fue procesado
        processed = @processed_fields.find { |pf| pf[:field_name] == field['name'] }
        if processed
          field.merge('value' => processed[:value])
        else
          field # Sin cambios si no fue procesado
        end
      else
        field # No es deficiency_field, mantener como está
      end
    end
  end

  private

  # Obtener deficiencias que tienen al menos un valor
  def get_deficiencies_with_data
    @form_fields.select do |field|
      field['type'] == 'Deficiency' && has_significant_data?(field)
    end
  end

  # Verificar si una deficiencia tiene datos significativos
  def has_significant_data?(deficiency)
    # Solo considerar significativo si tiene value O comment_value
    has_value = deficiency['value'].present? && deficiency['value'].strip != ''
    has_comment = deficiency['comment_value'].present? && deficiency['comment_value'].strip != ''

    # Debe tener al menos uno de los dos
    has_value || has_comment
  end

  # Agrupar campos deficiency_field por section_name
  def get_deficiency_field_groups
    deficiency_fields = @form_fields.select { |field| field['type'] == 'Deficiency_field' }

    # Agrupar por section_name
    groups = deficiency_fields.group_by { |field| field['section_name'] }

    # Ordenar las claves de manera natural (Def_1, Def_2, ..., Def_10, Def_11, etc.)
    sorted_keys = groups.keys.sort_by do |section_name|
      # Extraer el número del section_name (ej: "Def_1" -> 1)
      match = section_name.match(/(\d+)$/)
      match ? match[1].to_i : 0
    end

    Rails.logger.info "Grupos de deficiency_field encontrados: #{sorted_keys}"

    # Retornar como hash para acceso directo por clave
    result = {}
    sorted_keys.each { |key| result[key] = groups[key] }
    result
  end

  # Obtener fecha por defecto del formulario
  def get_default_date
    date_field = @form_fields.find { |field| field['type'] == 'Date' && field['value'].present? }
    date_field ? date_field['value'] : Date.current.strftime('%Y-%m-%d')
  end

  # Procesar deficiencias con mapeo inteligente
  def process_deficiencies_with_smart_mapping(deficiencies_with_data, deficiency_field_groups, default_date)
    # Estrategia: Mapeo secuencial simple
    Rails.logger.info 'Iniciando mapeo secuencial'

    group_keys = deficiency_field_groups.keys

    deficiencies_with_data.each_with_index do |deficiency, index|
      if index < group_keys.length
        target_group_key = group_keys[index]
        target_group = deficiency_field_groups[target_group_key]

        Rails.logger.info "Mapeo secuencial: #{deficiency['name']} -> #{target_group_key}"
        process_single_deficiency(deficiency, target_group, default_date, target_group_key)
      else
        Rails.logger.warn "No hay más grupos disponibles para #{deficiency['name']}"
      end
    end
  end

  # Procesar una deficiencia individual
  def process_single_deficiency(deficiency, target_group, default_date, group_key)
    Rails.logger.info "Procesando deficiencia '#{deficiency['name']}' con grupo '#{group_key}'"

    # Mapear valores a campos específicos por label_name (case insensitive)
    target_group.each do |field|
      label_name = field['label_name'].to_s.downcase.strip
      original_name = field['original_name'].to_s.downcase.strip
      value_to_set = nil

      # Mapeo más específico usando tanto label_name como original_name
      if matches_pattern(label_name, /item/) || matches_pattern(original_name, /item/)
        value_to_set = deficiency['Item'] if deficiency['Item'].present?
      elsif matches_pattern(label_name, /riser/) || matches_pattern(original_name, /riser/)
        value_to_set = deficiency['Riser'] if deficiency['Riser'].present?
      elsif matches_pattern(label_name, /^d\d*$/i) || matches_pattern(original_name, /^d\d*$/i)
        value_to_set = deficiency['D'] == 'Yes' ? 'X' : ''
      elsif matches_pattern(label_name, /^c\d*$/i) || matches_pattern(original_name, /^c\d*$/i)
        value_to_set = deficiency['C'] == 'Yes' ? 'X' : ''
      elsif matches_pattern(label_name, /deficiency/) || matches_pattern(original_name, /deficiency/)
        # Para campos de deficiencia, priorizar 'value', luego 'comment_value'
        if deficiency['value'].present? && deficiency['value'].strip != ''
          value_to_set = deficiency['value']
        elsif deficiency['comment_value'].present? && deficiency['comment_value'].strip != ''
          value_to_set = deficiency['comment_value']
        end
      elsif matches_pattern(label_name, /date/) || matches_pattern(original_name, /date/)
        value_to_set = default_date
      end

      # Solo procesar si hay un valor para setear
      next unless value_to_set.present?

      @processed_fields << {
        field_name: field['name'],
        value: value_to_set,
        mapped_from: "#{deficiency['name']} -> #{group_key} -> #{label_name}"
      }

      Rails.logger.info "  Mapeado: #{field['name']} (#{label_name}) = '#{value_to_set}'"
    end
  end

  # Método auxiliar para matching de patrones
  def matches_pattern(text, pattern)
    text.match?(pattern)
  end
end
