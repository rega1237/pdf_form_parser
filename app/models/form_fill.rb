class FormFill < ApplicationRecord
  belongs_to :form_template
  belongs_to :inspection, optional: true
  has_one_attached :filled_pdf
  has_many_attached :photos # Agregar para manejar múltiples fotos

  # Método para generar ID único de photo attachment
  def generate_unique_photo_attachment_id(field_section)
    return nil if field_section.blank? || inspection.blank?

    # 1. Reemplaza el '|' por '__' para la separacion del section y no ocurran errores luego
    safe_section_name = field_section.gsub('|', '__')

    # 2. Continúa con la sanitización normal
    parameterized_name = safe_section_name.parameterize.underscore

    # 3. Genera el nombre final
    random_suffix = SecureRandom.hex(4)
    "inspection_#{inspection.id}_#{parameterized_name}_#{random_suffix}"
  end

  # Método para adjuntar foto a un campo específico
  def attach_photo_for_field(field_name, photo_file)
    return { success: false, error: 'Campo o archivo vacío' } if field_name.blank? || photo_file.blank?

    begin
      # 1. Parsear la estructura para encontrar el section_name
      structure = JSON.parse(form_structure)
      field_data = structure.find { |field| field['name'] == field_name && field['type'] == 'Photo' }

      # Usar el section_name si existe, de lo contrario, usar el field_name como fallback
      field_section = field_data&.dig('section_name').presence || field_name

      # 2. Generar el ID único usando el section_name
      unique_attachment_id = generate_unique_photo_attachment_id(field_section)
      return { success: false, error: 'No se pudo generar ID único' } if unique_attachment_id.blank?

      # Remover foto existente si la hay
      existing_photo = get_photo_for_field(field_name)
      existing_photo&.purge

      # 3. Adjuntar la nueva foto con el nombre de archivo basado en el section_name
      photos.attach(
        io: photo_file,
        filename: "#{unique_attachment_id}.jpg",
        content_type: photo_file.content_type || 'image/jpeg'
      )

      # 4. Actualizar la estructura del formulario con el ID del adjunto
      success = update_photo_attachment_id_in_structure(field_name, unique_attachment_id)

      if success
        Rails.logger.info "Photo attached for field: #{field_name} with ID: #{unique_attachment_id}"
        { success: true, attachment_id: unique_attachment_id }
      else
        { success: false, error: 'Error al actualizar estructura del formulario' }
      end
    rescue JSON::ParserError => e
      Rails.logger.error "Error parsing form_structure: #{e.message}"
      { success: false, error: 'Error al parsear la estructura del formulario' }
    rescue StandardError => e
      Rails.logger.error "Error attaching photo for field #{field_name}: #{e.message}"
      { success: false, error: e.message }
    end
  end

  # Método para actualizar photo_attachment_id en form_structure
  def update_photo_attachment_id_in_structure(field_name, attachment_id)
    return false unless form_structure.present?

    begin
      structure = JSON.parse(form_structure)

      # Buscar el campo en la estructura
      field_data = structure.find { |field| field['name'] == field_name && field['type'] == 'Photo' }

      if field_data
        field_data['photo_attachment_id'] = attachment_id
        update(form_structure: structure.to_json)
        true
      else
        Rails.logger.error "Photo field '#{field_name}' not found in form structure"
        false
      end
    rescue JSON::ParserError => e
      Rails.logger.error "Error parsing form_structure: #{e.message}"
      false
    rescue StandardError => e
      Rails.logger.error "Error updating photo attachment ID in structure: #{e.message}"
      false
    end
  end

  # Método para obtener URL de foto por campo
  def get_photo_for_field(field_name)
    return nil if field_name.blank? || form_structure.blank?

    begin
      structure = JSON.parse(form_structure)
      field_data = structure.find { |field| field['name'] == field_name && field['type'] == 'Photo' }

      # Obtenemos el ID del adjunto directamente desde la estructura
      attachment_id = field_data['photo_attachment_id'] if field_data
      return nil if attachment_id.blank?

      # Buscamos la foto por el nombre de archivo, que es el ID único que guardamos
      photos.find { |p| p.filename.to_s.start_with?(attachment_id) }
    rescue JSON::ParserError
      nil
    end
  end

  # Método para obtener todas las fotos organizadas por campo
  def get_photos_by_field
    return {} unless photos.attached? && inspection.present?

    photos_hash = {}
    photos.each do |photo|
      # Extraer información del filename único
      filename = photo.filename.to_s.split('.').first

      # Pattern: inspection_123_field_name_abc123
      next unless filename.match(/^inspection_#{inspection.id}_(.+)_[a-f0-9]{8}$/)

      field_parameterized = ::Regexp.last_match(1)

      # Buscar el campo original en form_structure
      next unless form_structure.present?

      begin
        structure = JSON.parse(form_structure)
        original_field = structure.find do |field|
          field['type'] == 'Photo' && field['name'].parameterize.underscore == field_parameterized
        end

        if original_field
          photos_hash[original_field['name']] = {
            photo: photo,
            attachment_id: filename
            # URL se genera dinámicamente cuando sea necesario
          }
        end
      rescue JSON::ParserError
        Rails.logger.error 'Error parsing form_structure for photos'
      end
    end

    photos_hash
  end

  # Método para eliminar foto de un campo específico
  def remove_photo_for_field(field_name)
    return { success: false, error: 'Campo vacío' } if field_name.blank?

    begin
      # Buscar y eliminar la foto
      existing_photo = get_photo_for_field(field_name)
      if existing_photo.present?
        existing_photo.purge
        Rails.logger.info "Photo purged for field: #{field_name}"
      end

      # Actualizar form_structure para limpiar photo_attachment_id
      success = clear_photo_attachment_id_in_structure(field_name)

      if success
        Rails.logger.info "Photo removed completely for field: #{field_name}"
        { success: true, message: 'Foto eliminada exitosamente' }
      else
        { success: false, error: 'Error al actualizar estructura del formulario' }
      end
    rescue StandardError => e
      Rails.logger.error "Error removing photo for field #{field_name}: #{e.message}"
      { success: false, error: e.message }
    end
  end

  # Método para limpiar photo_attachment_id en form_structure
  def clear_photo_attachment_id_in_structure(field_name)
    return false unless form_structure.present?

    begin
      structure = JSON.parse(form_structure)

      # Buscar el campo en la estructura
      field_data = structure.find { |field| field['name'] == field_name && field['type'] == 'Photo' }

      if field_data
        field_data['photo_attachment_id'] = nil
        field_data['value'] = ''
        update(form_structure: structure.to_json)
        true
      else
        Rails.logger.error "Photo field '#{field_name}' not found in form structure"
        false
      end
    rescue JSON::ParserError => e
      Rails.logger.error "Error parsing form_structure: #{e.message}"
      false
    rescue StandardError => e
      Rails.logger.error "Error clearing photo attachment ID in structure: #{e.message}"
      false
    end
  end

  # Método de debug para ver todas las fotos
  def debug_photos
    puts "=== DEBUG PHOTOS FOR FORM_FILL ##{id} ==="
    puts "Inspection ID: #{inspection&.id}"
    puts "Total photos attached: #{photos.count}"

    photos.each_with_index do |photo, index|
      puts "Photo #{index + 1}:"
      puts "  - Filename: #{photo.filename}"
      puts "  - Content Type: #{photo.content_type}"
      puts "  - Blob present: #{photo.blob.present?}"
      puts "  - Record type: #{photo.record_type}"
      puts "  - Record ID: #{photo.record_id}"
    end

    if form_structure.present?
      structure = JSON.parse(form_structure)
      photo_fields = structure.select { |field| field['type'] == 'Photo' }

      puts "\nPhoto fields in structure:"
      photo_fields.each do |field|
        puts "  - Field: #{field['name']}"
        puts "  - Attachment ID: #{field['photo_attachment_id']}"

        # Test pattern matching
        field_pattern = "inspection_#{inspection.id}_#{field['name'].parameterize.underscore}_"
        puts "  - Expected pattern: #{field_pattern}"

        matching_photo = photos.find { |photo| photo.filename.to_s.include?(field_pattern) }
        puts "  - Has matching photo: #{matching_photo.present?}"

        puts "  - Matching filename: #{matching_photo.filename}" if matching_photo
      end
    end
    puts '=== END DEBUG ==='
  end

  # Método existente para obtener la URL del archivo PDF rellenado
  def pdf_url
    return unless filled_pdf.attached?

    Rails.application.routes.url_helpers.rails_blob_path(filled_pdf, only_path: true)
  end
end
