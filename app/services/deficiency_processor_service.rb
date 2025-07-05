require 'set'

class DeficiencyProcessorService
  def initialize(deficiencies_data:, target_fields:)
    @deficiencies_data = deficiencies_data
    @target_fields = target_fields
    @processed_fields = []
    @unprocessed_deficiencies = []
  end

  def process
    deficiency_field_groups = group_target_fields_by_section
    sorted_group_keys = deficiency_field_groups.keys.sort_by { |name| name.scan(/\d+/).first.to_i }

    @deficiencies_data.each_with_index do |deficiency, index|
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

  def group_target_fields_by_section
    @target_fields.group_by { |field| field['section_name'] }
  end

  def process_single_deficiency(deficiency, target_group)
    default_date = get_default_date

    # 1. Detectar si este grupo de campos usa el campo unificado 'CBDorC'.
    # Buscamos en el grupo un campo cuyo nombre o label contenga "cbdorc".
    cbdorc_field = target_group.find do |f|
      f['name'].to_s.downcase.include?('cbdorc') || f['label_name'].to_s.downcase.include?('cbdorc')
    end

    if cbdorc_field
      # --- Lógica para el formulario de DEFICIENCIAS (con CBDorC) ---

      # Asignar valor a 'CBDorC' basado en D y C, con prioridad para D.
      if deficiency['D'] == 'Yes'
        add_processed_field(cbdorc_field, 'Choice1', deficiency['name'])
      elsif deficiency['C'] == 'Yes'
        add_processed_field(cbdorc_field, 'Choice2', deficiency['name'])
      end

      # Llenar los otros campos (Item, Riser, etc.) normalmente.
      target_group.each do |field|
        next if field == cbdorc_field # Ya procesamos este campo, lo saltamos.

        value_to_set = map_standard_fields(field, deficiency, default_date)
        add_processed_field(field, value_to_set, deficiency['name']) if value_to_set.present?
      end

    else
      # --- Lógica para el formulario PRINCIPAL (con campos D y C separados) ---

      target_group.each do |field|
        value_to_set = map_standard_fields(field, deficiency, default_date)
        add_processed_field(field, value_to_set, deficiency['name']) if value_to_set.present?
      end
    end
    # --- FIN DE LA NUEVA LÓGICA ---
  end

  # Método ayudante para mapear campos estándar (reutilizable)
  def map_standard_fields(field, deficiency, default_date)
    label_name = field['label_name'].to_s.downcase.strip

    case label_name
    when /item/
      deficiency['Item']
    when /riser/
      deficiency['Riser']
    when /^d\d*$/i
      deficiency['D'] == 'Yes' ? 'X' : ''
    when /^c\d*$/i
      deficiency['C'] == 'Yes' ? 'X' : ''
    when /deficiency/
      deficiency['value'].presence || deficiency['comment_value']
    when /date/
      default_date
    else
      nil # No coincide con ningún campo estándar
    end
  end

  # Método ayudante para añadir un campo a la lista de procesados
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
