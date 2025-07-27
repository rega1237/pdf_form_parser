require 'set'

class DeficiencyProcessorService
  def initialize(deficiencies_data:, target_fields:)
    @deficiencies_data = deficiencies_data || []
    @target_fields = target_fields || []
    @processed_fields = []
    @unprocessed_deficiencies = []
  end

  def process
    Rails.logger.info '=================================================='
    Rails.logger.info '[DeficiencyProcessor] ==> INICIANDO PROCESO DE DEFICIENCIAS.'
    Rails.logger.debug "[DeficiencyProcessor] Datos de deficiencias recibidos (#{@deficiencies_data.count}): #{@deficiencies_data.inspect}"
    Rails.logger.debug "[DeficiencyProcessor] Campos del PDF recibidos (#{@target_fields.count}): #{@target_fields.map do |f|
      f['name']
    end}"

    deficiency_field_groups = group_target_fields_by_section
    sorted_group_keys = deficiency_field_groups.keys.sort_by { |name| name.scan(/\d+/).first.to_i }

    Rails.logger.info "[DeficiencyProcessor] Se encontraron #{sorted_group_keys.count} grupos de campos en el PDF: #{sorted_group_keys}"

    @deficiencies_data.each_with_index do |deficiency, index|
      next unless deficiency.is_a?(Hash) && deficiency['name'].present?

      if index < sorted_group_keys.length
        target_group_key = sorted_group_keys[index]
        target_group = deficiency_field_groups[target_group_key]

        Rails.logger.info '--------------------------------------------------'
        Rails.logger.info "[DeficiencyProcessor] Procesando Deficiencia ##{index + 1}: '#{deficiency['name']}' con Grupo de PDF: '#{target_group_key}'"

        process_single_deficiency(deficiency, target_group)
      else
        @unprocessed_deficiencies << deficiency
      end
    end

    Rails.logger.info '=================================================='
    Rails.logger.info '[DeficiencyProcessor] <== PROCESO FINALIZADO.'
    Rails.logger.info "[DeficiencyProcessor] Total de campos procesados para el PDF: #{@processed_fields.count}"
    if @unprocessed_deficiencies.any?
      Rails.logger.warn "[DeficiencyProcessor] ¡ATENCIÓN! Quedaron #{@unprocessed_deficiencies.count} deficiencias sin procesar: #{@unprocessed_deficiencies.inspect}"
    else
      Rails.logger.info '[DeficiencyProcessor] Todas las deficiencias fueron procesadas exitosamente.'
    end
    Rails.logger.info '=================================================='

    {
      processed_fields: @processed_fields,
      unprocessed_deficiencies: @unprocessed_deficiencies
    }
  end

  private

  def group_target_fields_by_section
    valid_fields = @target_fields.select { |field| field.is_a?(Hash) && field['section_name'].present? }
    valid_fields.group_by { |field| field['section_name'] }
  end

  def process_single_deficiency(deficiency, target_group)
    default_date = get_default_date

    unified_dc_field = target_group.find do |f|
      name_down = f['name'].to_s.downcase
      label_down = f['label_name'].to_s.downcase
      name_down.include?('cbdorc') || label_down.include?('cbdorc') || name_down == 'defdc' || label_down == 'defdc'
    end

    if unified_dc_field
      Rails.logger.debug "  [Lógica] Se detectó un campo unificado D/C: '#{unified_dc_field['name']}'"
    else
      Rails.logger.debug '  [Lógica] No se encontró campo unificado D/C. Se procesarán D y C por separado.'
    end

    if unified_dc_field
      if deficiency['D'] == 'Yes'
        add_processed_field(unified_dc_field, 'Choice1', deficiency['name'])
      elsif deficiency['C'] == 'Yes'
        add_processed_field(unified_dc_field, 'Choice2', deficiency['name'])
      end

      target_group.each do |field|
        next if field == unified_dc_field

        value_to_set = map_standard_fields(field, deficiency, default_date)
        add_processed_field(field, value_to_set, deficiency['name']) if value_to_set.present?
      end
    else
      target_group.each do |field|
        value_to_set = map_standard_fields(field, deficiency, default_date)
        add_processed_field(field, value_to_set, deficiency['name']) if value_to_set.present?
      end
    end
  end

  # --- MÉTODO CORREGIDO ---
  def map_standard_fields(field, deficiency, default_date)
    label_name = field['label_name'].to_s.downcase.strip

    Rails.logger.debug "    [Mapeo] Intentando mapear campo del PDF: '#{field['name']}' (Label: '#{label_name}')"

    # 1. Reglas más específicas primero para evitar falsos positivos.
    value = if label_name.start_with?('date')
              default_date
            elsif label_name.include?('deficien') # include? es bueno para comentarios largos
              deficiency['value'].presence || deficiency['comment_value']
            elsif label_name.start_with?('item')
              deficiency['Item']
            elsif label_name.start_with?('riser')
              deficiency['Riser']
            # 2. Expresiones regulares precisas para 'D' y 'C'.
            #    Esto busca una 'd' o 'c' al inicio, seguida de números (o nada), y nada más.
            elsif /\Ad\d*\z/i =~ $_
              deficiency['D'] == 'Yes' ? 'X' : ''
            elsif /\Ac\d*\z/i =~ $_
              deficiency['C'] == 'Yes' ? 'X' : ''
            else
              nil # No coincide con ninguna regla
            end

    if value.present?
      Rails.logger.debug "      -> Éxito. Valor asignado: '#{value}'"
    else
      Rails.logger.debug "      -> Sin valor. El label '#{label_name}' no coincide con ninguna regla de mapeo o el valor de origen está vacío."
    end

    value
  end
  # --- FIN DEL MÉTODO CORREGIDO ---

  def add_processed_field(field, value, source_deficiency_name)
    processed_field = field.dup
    processed_field['value'] = value
    @processed_fields << processed_field
    Rails.logger.info "  -> Mapeo desde '#{source_deficiency_name}': El campo '#{field['name']}' se llenará con '#{value}'."
  end

  def get_default_date
    Date.current.strftime('%Y-%m-%d')
  end
end
