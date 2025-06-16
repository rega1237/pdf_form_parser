require 'pdf-forms'

class PdfFormsParserService
  def initialize(file_path)
    @pdftk = PdfForms.new(utf8_fields: true) # Enable UTF-8 support
    @file_path = file_path
  end

  def parse
    # Try with different encoding options
    raw_fields = get_fields_with_encoding
    
    # Map fields and filter out those with empty values
    raw_fields.map do |field|
      {
        name: sanitize_field_name(field.name),
        original_name: field.name, # Keep original for reference
        type: field.type,
        value: field.value,
        options: field.options,
        human_label: generate_human_label(field.name),
        label_name: field.value # Add label_name equal to value
      }
    end.reject { |field| field[:value].nil? || field[:value].to_s.empty? || field[:value] == 'Off' }
  rescue PdfForms::PdftkError => e
    Rails.logger.error "PdftkError while parsing #{@file_path}: #{e.message}"
    
    # Fallback: try alternative methods
    fallback_parse
  rescue StandardError => e
    Rails.logger.error "Unexpected error while parsing #{@file_path}: #{e.message}"
    []
  end

  def fill_form(output_path, field_data)
    # Convert field data and handle special characters
    field_values = prepare_field_values(field_data)
    
    # Try filling with original names first
    @pdftk.fill_form(@file_path, output_path, field_values)
    output_path
  rescue PdfForms::PdftkError => e
    Rails.logger.error "PdftkError while filling form #{@file_path}: #{e.message}"
    
    # Try with alternative encoding or field name mapping
    retry_fill_form(output_path, field_data, e)
  end

  private

  def get_fields_with_encoding
    # Try different approaches to handle special characters
    begin
      @pdftk.get_fields(@file_path)
    rescue => e
      Rails.logger.warn "Standard field extraction failed, trying with dump_data_fields"
      get_fields_via_dump_data
    end
  end

  def get_fields_via_dump_data
    # Alternative method using pdftk's dump_data_fields
    # This sometimes works better with special characters
    dump_output = `pdftk "#{@file_path}" dump_data_fields 2>/dev/null`
    
    if $?.success?
      parse_dump_data_output(dump_output)
    else
      Rails.logger.error "pdftk dump_data_fields failed for #{@file_path}"
      []
    end
  end

  def parse_dump_data_output(dump_output)
    fields = []
    current_field = {}
    
    dump_output.each_line do |line|
      line = line.strip
      
      case line
      when /^FieldName: (.+)/
        # Save previous field if exists
        fields << create_field_object(current_field) unless current_field.empty?
        current_field = { name: $1 }
      when /^FieldType: (.+)/
        current_field[:type] = $1
      when /^FieldValue: (.+)/
        current_field[:value] = $1
      when /^FieldStateOption: (.+)/
        current_field[:options] ||= []
        current_field[:options] << $1
      end
    end
    
    # Don't forget the last field
    fields << create_field_object(current_field) unless current_field.empty?
    fields
  end

  def create_field_object(field_data)
    # Create a simple object that mimics PdfForms field structure
    OpenStruct.new(
      name: field_data[:name],
      type: field_data[:type] || 'Text',
      value: field_data[:value],
      options: field_data[:options] || []
    )
  end

  def sanitize_field_name(name)
    return name unless name
    
    # Handle common problematic characters
    name.to_s.encode('UTF-8', invalid: :replace, undef: :replace, replace: '')
  end

  def generate_human_label(field_name)
    return field_name unless field_name
    
    # Convert field names like "Location_row_1" to "Location Row 1"
    field_name.to_s
              .gsub('_', ' ')
              .gsub(/([a-z])([A-Z])/, '\1 \2') # Handle camelCase
              .split.map(&:capitalize).join(' ')
  end

  def prepare_field_values(field_data)
    field_values = {}
    
    field_data.each do |field|
      next unless field['name'].present? && field['value'].present?
      
      # Try both original name and any variations
      field_name = field['name']
      field_value = field['value'].to_s.encode('UTF-8', invalid: :replace, undef: :replace)
      
      field_values[field_name] = field_value
      
      # Also try with original_name if it exists
      if field['original_name'].present? && field['original_name'] != field_name
        field_values[field['original_name']] = field_value
      end
    end
    
    field_values
  end

  def retry_fill_form(output_path, field_data, original_error)
    # Try with escaped field names or alternative methods
    Rails.logger.info "Retrying form fill with alternative approach"
    

    raise original_error
  end

  def fallback_parse
    Rails.logger.info "Attempting fallback parsing method"
    
    # Try using system command directly
    begin
      fields = get_fields_via_dump_data
      
      # Apply the same filtering and label_name addition as in the main parse method
      fields.map do |field|
        field_hash = {
          name: sanitize_field_name(field.name),
          original_name: field.name,
          type: field.type,
          value: field.value,
          options: field.options,
          human_label: generate_human_label(field.name),
          label_name: field.value # Add label_name equal to value
        }
        field_hash
      end.reject { |field| field[:value].nil? || field[:value].to_s.empty? }
    rescue => e
      Rails.logger.error "Fallback parsing also failed: #{e.message}"
      []
    end
  end
end
