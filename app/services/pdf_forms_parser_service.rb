require 'pdf-forms'
require 'tempfile'
require_relative 'pdf_signature_service'

class PdfFormsParserService
  def initialize(file_path)
    @pdftk = PdfForms.new(utf8_fields: true) # Enable UTF-8 support
    @file_path = file_path
  end

  def parse
    # Try with different encoding options
    raw_fields = get_fields_with_encoding
    sig_map = begin
      sigs = PdfSignatureService.list_signature_fields(@file_path)
      map = {}
      sigs.each do |h|
        name = h[:name]
        info = h[:info]&.to_h
        map[name] = info if name
        sanitized = sanitize_field_name(name)
        map[sanitized] = info if sanitized && sanitized != name
      end
      map
    rescue
      {}
    end

    # Map fields and filter out those with empty values
    parsed = raw_fields.map do |field|
      is_sig = signature_field?(field)
      sig_info = is_sig ? sig_map[field.name] : nil
      {
        name: sanitize_field_name(field.name),
        original_name: field.name, # Keep original for reference
        type: is_sig ? 'Signature_Field' : field.type,
        value: '', # Changed: Now always empty string instead of field.value
        options: field.options,
        human_label: generate_human_label(field.name),
        label_name: field.value, # Keep original value here for reference
        is_signature: is_sig,
        signature_info: sig_info&.to_h
      }
    end
    parsed.reject do |field|
      # Mantener siempre los campos de firma, estén firmados o no
      next false if field[:is_signature]
      # Para el resto, aplicar el filtro por label
      field[:label_name].nil? || field[:label_name].to_s.empty? || field[:label_name] == 'Off'
    end
    # Note: Changed filtering to use label_name instead of value since value is now always empty
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
    normal_fields, signature_requests = partition_signature_requests(field_data)
    field_values = prepare_field_values(normal_fields)

    # Try filling with original names first
    intermediate_path = output_path
    @pdftk.fill_form(@file_path, intermediate_path, field_values)

    # Apply signatures one by one on the already-filled PDF
    signature_requests.each do |sig|
      tmp_out = Tempfile.create(['signed_', '.pdf'])
      tmp_out_path = tmp_out.path
      tmp_out.close

      field_name = sig['original_name'].presence || sig['name']
      if sig['certificate_path'].present?
        # Firma digital con certificado (si se proporciona)
        PdfSignatureService.sign(
          intermediate_path,
          tmp_out_path,
          field_name,
          certificate_path: sig['certificate_path'],
          certificate_password: sig['certificate_password'],
          key_path: sig['key_path'],
          reason: sig['reason'],
          location: sig['location'],
          contact_info: sig['contact_info'],
          name: sig['signer_name'] || sig['name_label'],
          signature_image_path: sig['signature_image_path']
        )
      else
        # Sin certificado: solo estampar imagen de firma manuscrita en el campo
        image_path = sig['signature_image_path']
        if image_path.present? && File.exist?(image_path)
          PdfSignatureService.stamp_signature_image(
            intermediate_path,
            tmp_out_path,
            field_name,
            image_path,
            scale_to_fit: true,
            margin: 0,
            allow_upscale: false
          )
        else
          Rails.logger.warn "Signature image path missing or not found for field '#{field_name}'. Skipping image stamp."
          # Si no hay imagen, simplemente copiar el PDF intermedio sin cambios
          FileUtils.cp(intermediate_path, tmp_out_path)
        end
      end

      intermediate_path = tmp_out_path
    end

    if intermediate_path != output_path
      FileUtils.cp(intermediate_path, output_path)
    end

    output_path
  rescue PdfForms::PdftkError => e
    Rails.logger.error "PdftkError while filling form #{@file_path}: #{e.message}"

    # Try with alternative encoding or field name mapping
    retry_fill_form(output_path, field_data, e)
  end

  private

  def signature_field?(field)
    type = field.type.to_s.downcase
    type.include?('sig') || type.include?('signature')
  rescue
    false
  end

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
      # Allow processing even if field['value'] is an empty string
      next unless field['name'].present?

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
      sig_map = begin
        sigs = PdfSignatureService.list_signature_fields(@file_path)
        map = {}
        sigs.each do |h|
          name = h[:name]
          info = h[:info]&.to_h
          map[name] = info if name
          sanitized = sanitize_field_name(name)
          map[sanitized] = info if sanitized && sanitized != name
        end
        map
      rescue
        {}
      end

      # Apply the same filtering and label_name addition as in the main parse method
      fields.map do |field|
        is_sig = signature_field?(field)
        sig_info = is_sig ? sig_map[field.name] : nil
        field_hash = {
          name: sanitize_field_name(field.name),
          original_name: field.name,
          type: is_sig ? 'Signature_Field' : field.type,
          value: '', # Changed: Now always empty string instead of field.value
          options: field.options,
          human_label: generate_human_label(field.name),
          label_name: field.value, # Keep original value here for reference
          is_signature: is_sig,
          signature_info: sig_info&.to_h
        }
        field_hash
      end.reject { |field| field[:is_signature] ? false : (field[:label_name].nil? || field[:label_name].to_s.empty?) }
      # Note: Changed filtering to use label_name instead of value since value is now always empty
    rescue => e
      Rails.logger.error "Fallback parsing also failed: #{e.message}"
      []
    end
  end

  # Separate signature entries from normal fields.
  def partition_signature_requests(field_data)
    normal = []
    signatures = []
    field_data.each do |field|
      # Only treat technical field signatures as signature requests.
      # Annex/client signatures should be handled separately in merging.
      if field['is_signature'] || field['type'].to_s == 'Signature_Field' || field['type'].to_s == 'Signature'
        signatures << field
      else
        normal << field
      end
    end
    [normal, signatures]
  end

  def signature_field_name?(name)
    return false unless name
    name.to_s.downcase.include?('sig') || name.to_s.downcase.include?('signature')
  end
end
