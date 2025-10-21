class FormFill < ApplicationRecord
  belongs_to :form_template
  belongs_to :inspection, optional: true
  has_one_attached :filled_pdf
  has_many_attached :photos # Agregar para manejar múltiples fotos

  # Estados de generación del PDF
  enum :pdf_generation_status, {
    ready: 'ready',           # Listo para generar PDF
    generating: 'generating', # Generando PDF
    completed: 'completed',   # PDF generado exitosamente
    failed: 'failed'          # Error en la generación
  }

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

      # 2. PRIMERO eliminar todas las fotos existentes para este campo
      remove_all_photos_for_field(field_name)

      # 3. Generar el ID único usando el section_name
      unique_attachment_id = generate_unique_photo_attachment_id(field_section)
      return { success: false, error: 'No se pudo generar ID único' } if unique_attachment_id.blank?

      # 4. Adjuntar la nueva foto con el nombre de archivo basado en el section_name
      photos.attach(
        io: photo_file,
        filename: "#{unique_attachment_id}.jpg",
        content_type: photo_file.content_type || 'image/jpeg'
      )

      # 5. Actualizar la estructura del formulario con el ID del adjunto
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

  # Método para actualizar photo_attachment_id en data column (updated for new structure)
  def update_photo_attachment_id_in_structure(field_name, attachment_id)
    return false if field_name.blank?

    begin
      # Store photo attachment ID in the data column instead of form_structure
      photo_data_key = "#{field_name}_photo_attachment_id"
      set_field_value(photo_data_key, attachment_id)

      Rails.logger.info "Updated photo attachment ID for field '#{field_name}': #{attachment_id}"
      true
    rescue StandardError => e
      Rails.logger.error "Error updating photo attachment ID for field #{field_name}: #{e.message}"
      false
    end
  end

  # Método para obtener foto por campo (updated for new data structure)
  def get_photo_for_field(field_name)
    return nil if field_name.blank?

    begin
      # Get photo attachment ID from data column instead of form_structure
      photo_data_key = "#{field_name}_photo_attachment_id"
      attachment_id = get_field_value(photo_data_key)

      # Return nil if no attachment ID is stored
      return nil unless attachment_id.present?

      # Buscamos la foto por el nombre de archivo, que es el ID único que guardamos
      photos.find { |p| p.filename.to_s.start_with?(attachment_id) }
    rescue StandardError => e
      Rails.logger.error "Error getting photo for field #{field_name}: #{e.message}"
      nil
    end
  end

  # Método para obtener todas las fotos organizadas por campo (updated for new data structure)
  def get_photos_by_field
    return {} unless photos.attached?

    photos_hash = {}

    # Get all photo attachment IDs from data column
    data.each do |key, value|
      # Look for keys that end with '_photo_attachment_id'
      next unless key.end_with?('_photo_attachment_id') && value.present?

      # Extract field name by removing the suffix
      field_name = key.gsub('_photo_attachment_id', '')
      attachment_id = value

      # Find the corresponding photo
      photo = photos.find { |p| p.filename.to_s.start_with?(attachment_id) }

      next unless photo

      photos_hash[field_name] = {
        photo: photo,
        attachment_id: attachment_id
        # URL se genera dinámicamente cuando sea necesario
      }
    end

    photos_hash
  end

  # Método para eliminar TODAS las fotos de un campo específico
  def remove_all_photos_for_field(field_name)
    return if field_name.blank? || !photos.attached?

    begin
      # Parsear la estructura para obtener información del campo
      structure = JSON.parse(form_structure) if form_structure.present?
      field_data = structure&.find { |field| field['name'] == field_name && field['type'] == 'Photo' }

      # Obtener el section_name para buscar fotos
      field_section = field_data&.dig('section_name').presence || field_name
      safe_section_name = field_section.gsub('|', '__')
      parameterized_name = safe_section_name.parameterize.underscore

      # Buscar todas las fotos que coincidan con el patrón del campo (nuevo esquema con inspection + section)
      field_pattern = "inspection_#{inspection.id}_#{parameterized_name}_"

      photos_to_remove = photos.select do |photo|
        photo.filename.to_s.include?(field_pattern)
      end

      # Fallback 1: si existe un attachment_id guardado en data, eliminar por prefijo de filename
      begin
        stored_attachment_id = get_field_value("#{field_name}_photo_attachment_id")
      rescue StandardError
        stored_attachment_id = nil
      end
      if stored_attachment_id.present?
        photos_to_remove += photos.select { |photo| photo.filename.to_s.start_with?(stored_attachment_id) }
      end

      # Fallback 2 (legado): si data[field_name] guarda el id del attachment de ActiveStorage, eliminar esa foto directamente
      begin
        legacy_attachment_record_id = get_field_value(field_name)
      rescue StandardError
        legacy_attachment_record_id = nil
      end
      if legacy_attachment_record_id.present?
        photos_to_remove += photos.select { |photo| photo.id.to_s == legacy_attachment_record_id.to_s }
      end

      # Asegurar unicidad
      photos_to_remove = photos_to_remove.uniq

      # Eliminar todas las fotos encontradas
      photos_to_remove.each do |photo|
        Rails.logger.info "Removing photo for field '#{field_name}': #{photo.filename} (id=#{photo.id})"
        photo.purge
      end

      Rails.logger.info "Removed #{photos_to_remove.count} photos for field: #{field_name}"
    rescue JSON::ParserError => e
      Rails.logger.error "Error parsing form_structure in remove_all_photos_for_field: #{e.message}"
    rescue StandardError => e
      Rails.logger.error "Error removing all photos for field #{field_name}: #{e.message}"
    end
  end

  # Método para eliminar foto de un campo específico (interfaz pública)
  def remove_photo_for_field(field_name)
    return { success: false, error: 'Campo vacío' } if field_name.blank?

    begin
      # Usar el método que elimina todas las fotos del campo
      remove_all_photos_for_field(field_name)

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

  # Método para limpiar photo_attachment_id en data column (updated for new structure)
  def clear_photo_attachment_id_in_structure(field_name)
    return false if field_name.blank?

    begin
      # Clear photo attachment ID from data column instead of form_structure
      photo_data_key = "#{field_name}_photo_attachment_id"
      set_field_value(photo_data_key, nil)

      # Also clear the field value
      set_field_value(field_name, '')

      Rails.logger.info "Cleared photo attachment ID for field '#{field_name}'"
      true
    rescue StandardError => e
      Rails.logger.error "Error clearing photo attachment ID for field #{field_name}: #{e.message}"
      false
    end
  end

  # Método para limpiar fotos duplicadas existentes
  def cleanup_duplicate_photos!
    return { cleaned: 0, message: 'No photos to clean' } unless photos.attached? && form_structure.present?

    begin
      structure = JSON.parse(form_structure)
      photo_fields = structure.select { |field| field['type'] == 'Photo' }

      cleaned_count = 0

      photo_fields.each do |field|
        field_name = field['name']
        field_section = field.dig('section_name').presence || field_name
        safe_section_name = field_section.gsub('|', '__')
        parameterized_name = safe_section_name.parameterize.underscore
        field_pattern = "inspection_#{inspection.id}_#{parameterized_name}_"

        # Encontrar todas las fotos para este campo
        field_photos = photos.select { |photo| photo.filename.to_s.include?(field_pattern) }

        next unless field_photos.count > 1

        # Mantener solo la más reciente y eliminar las demás
        photos_to_keep = field_photos.sort_by(&:created_at).last(1)
        photos_to_remove = field_photos - photos_to_keep

        photos_to_remove.each do |photo|
          Rails.logger.info "Cleaning duplicate photo: #{photo.filename}"
          photo.purge
          cleaned_count += 1
        end

        # Actualizar la estructura con el attachment_id de la foto que se mantuvo
        next unless photos_to_keep.any?

        kept_photo = photos_to_keep.first
        attachment_id = kept_photo.filename.to_s.split('.').first
        field['photo_attachment_id'] = attachment_id
      end

      # Actualizar la estructura si se hicieron cambios
      update(form_structure: structure.to_json) if cleaned_count > 0

      Rails.logger.info "Cleaned #{cleaned_count} duplicate photos for FormFill ##{id}"
      { cleaned: cleaned_count, message: "Cleaned #{cleaned_count} duplicate photos" }
    rescue JSON::ParserError => e
      Rails.logger.error "Error parsing form_structure in cleanup_duplicate_photos: #{e.message}"
      { cleaned: 0, error: e.message }
    rescue StandardError => e
      Rails.logger.error "Error cleaning duplicate photos: #{e.message}"
      { cleaned: 0, error: e.message }
    end
  end

  # Método para sincronizar fotos existentes con la estructura del formulario
  def sync_photos_with_structure!
    return false unless form_structure.present? && photos.attached?

    begin
      structure = JSON.parse(form_structure)
      photo_fields = structure.select { |field| field['type'] == 'Photo' }
      structure_updated = false

      photo_fields.each do |field|
        field_name = field['name']

        # Si el campo ya tiene photo_attachment_id, verificar que la foto existe
        if field['photo_attachment_id'].present?
          existing_photo = get_photo_for_field(field_name)
          # Si no existe la foto, limpiar el attachment_id
          if existing_photo.blank?
            field['photo_attachment_id'] = nil
            structure_updated = true
          end
        else
          # Si no tiene attachment_id, buscar si hay una foto para este campo
          field_section = field.dig('section_name').presence || field_name
          safe_section_name = field_section.gsub('|', '__')
          parameterized_name = safe_section_name.parameterize.underscore
          field_pattern = "inspection_#{inspection.id}_#{parameterized_name}_"

          # Buscar foto que coincida con el patrón
          matching_photo = photos.find { |photo| photo.filename.to_s.include?(field_pattern) }

          if matching_photo
            # Extraer el attachment_id del filename
            attachment_id = matching_photo.filename.to_s.split('.').first
            field['photo_attachment_id'] = attachment_id
            structure_updated = true
            Rails.logger.info "Synced photo for field #{field_name}: #{attachment_id}"
          end
        end
      end

      # Actualizar la estructura si hubo cambios
      if structure_updated
        update(form_structure: structure.to_json)
        Rails.logger.info "Form structure synced with existing photos for FormFill ##{id}"
      end

      true
    rescue JSON::ParserError => e
      Rails.logger.error "Error syncing photos with structure: #{e.message}"
      false
    rescue StandardError => e
      Rails.logger.error "Error in sync_photos_with_structure: #{e.message}"
      false
    end
  end

  # Método para obtener URL de foto por campo
  def get_photo_url_for_field(field_name)
    photo = get_photo_for_field(field_name)
    return nil unless photo.present?

    Rails.application.routes.url_helpers.rails_blob_path(photo, only_path: true)
  end

  # Método existente para obtener la URL del archivo PDF rellenado
  def pdf_url
    return unless filled_pdf.attached?

    Rails.application.routes.url_helpers.rails_blob_path(filled_pdf, only_path: true)
  end

  # Método para calcular conteos de Pass, Fail y N/A
  def calculate_form_counts
    return { pass: 0, fail: 0, na: 0 } unless form_structure.present?

    begin
      counts = { pass: 0, fail: 0, na: 0 }

      data.each_value do |data_value|
        value = data_value.to_s.downcase
        case value
        when 'pass'
          counts[:pass] += 1
        when 'fail'
          counts[:fail] += 1
        when 'n/a', 'na'
          counts[:na] += 1
        end
      end

      counts
    rescue JSON::ParserError => e
      Rails.logger.error "Error parsing form_structure for counts: #{e.message}"
      { pass: 0, fail: 0, na: 0 }
    end
  end

  def get_sprinklers_data
    sprinklers = { number: 0, date: '', brand: '', notes: '' }

    data.each do |key, value|
      case key
      when 'Number_of_sprinklers'
        sprinklers[:number] = value
      when 'Manufactering_Date'
        sprinklers[:date] = value
      when 'Brand'
        sprinklers[:brand] = value
      when 'Notes'
        sprinklers[:notes] = value
      end
    end

    sprinklers
  end

  # ========================================
  # NEW DATA COLUMN ACCESS METHODS
  # ========================================

  # Retrieve user value for a specific field from the data column
  def get_field_value(field_name)
    return nil if field_name.blank?

    # Handle case where data might be nil (defensive programming)
    return nil if data.nil?

    data[field_name.to_s]
  end

  # Store user value for a specific field in the data column
  def set_field_value(field_name, value)
    return false if field_name.blank?

    begin
      # Initialize data as empty hash if nil (defensive programming)
      self.data = {} if data.nil?

      # Set the field value
      self.data = data.merge(field_name.to_s => value)

      # Save the changes
      save
    rescue StandardError => e
      Rails.logger.error "Error setting field value for #{field_name}: #{e.message}"
      false
    end
  end

  # Update multiple fields efficiently in a single operation
  def bulk_update_data(field_hash)
    return false if field_hash.blank? || !field_hash.is_a?(Hash)

    begin
      # Initialize data as empty hash if nil (defensive programming)
      self.data = {} if data.nil?

      # Convert keys to strings and merge with existing data
      string_keyed_hash = field_hash.transform_keys(&:to_s)
      self.data = data.merge(string_keyed_hash)

      # Save the changes
      save
    rescue StandardError => e
      Rails.logger.error "Error bulk updating data: #{e.message}"
      false
    end
  end

  # ========================================
  # LEGACY DATA MIGRATION METHODS
  # ========================================

  # Check if this form fill has legacy data (uses form_structure for data storage)
  def has_legacy_data?
    return false if form_structure.blank?

    begin
      structure = JSON.parse(form_structure)

      # Check if any field in the structure has a 'value' key (legacy format)
      structure.any? { |field| field.key?('value') && field['value'].present? }
    rescue JSON::ParserError => e
      Rails.logger.error "Error parsing form_structure in has_legacy_data?: #{e.message}"
      false
    end
  end

  # Migrate legacy data from form_structure to the new data column
  def migrate_legacy_data!
    return false unless has_legacy_data?

    begin
      structure = JSON.parse(form_structure)
      migrated_data = {}

      # Extract values from form_structure and build data hash
      structure.each do |field|
        field_name = field['name']
        field_value = field['value']

        # Only migrate non-empty values
        migrated_data[field_name] = field_value if field_name.present? && field_value.present?
      end

      # Update the data column with migrated values
      if migrated_data.any?
        # Initialize data as empty hash if nil
        self.data = {} if data.nil?

        # Merge migrated data with existing data (existing data takes precedence)
        self.data = migrated_data.merge(data)

        # Clear values from form_structure (keep structure, remove values)
        cleaned_structure = structure.map do |field|
          field_copy = field.dup
          field_copy.delete('value') # Remove the value key
          field_copy
        end

        # Update form_structure without values
        self.form_structure = cleaned_structure.to_json

        # Save the changes
        save!

        Rails.logger.info "Migrated legacy data for FormFill ##{id}: #{migrated_data.keys.join(', ')}"
        true
      else
        Rails.logger.info "No legacy data to migrate for FormFill ##{id}"
        false
      end
    rescue JSON::ParserError => e
      Rails.logger.error "Error parsing form_structure in migrate_legacy_data!: #{e.message}"
      false
    rescue StandardError => e
      Rails.logger.error "Error migrating legacy data for FormFill ##{id}: #{e.message}"
      false
    end
  end

  # Merge structure and data for PDF generation (backward compatibility)
  def merge_structure_with_data
    return [] if form_structure.blank?

    begin
      structure = JSON.parse(form_structure)

      # Merge data values back into structure for PDF generation
      structure.map do |field|
        field_copy = field.dup
        field_name = field['name']

        # Get value from data column first, then fallback to existing value in structure
        if field_name.present?
          data_value = get_field_value(field_name)
          structure_value = field['value']

          # Use data column value if available, otherwise use structure value
          field_copy['value'] = data_value.present? ? data_value : structure_value
        end

        field_copy
      end
    rescue JSON::ParserError => e
      Rails.logger.error "Error parsing form_structure in merge_structure_with_data: #{e.message}"
      []
    rescue StandardError => e
      Rails.logger.error "Error merging structure with data for FormFill ##{id}: #{e.message}"
      []
    end
  end

  # ========================================
  # MANAGE PDF CREATION
  # ========================================

  # Mark PDF as created when successfully generated
  def mark_pdf_created!
    update!(pdf_created: true, pdf_generation_status: 'completed')
  end

  # Check if this form fill has an individual PDF created
  def has_individual_pdf?
    pdf_created? && filled_pdf.attached?
  end

  # Check if this is the main form fill for the inspection
  def main_form_fill?
    inspection.present? && inspection.form_template_id == form_template_id
  end

  # Check if this form fill should be included in the main PDF merge
  def should_include_in_main_merge?
    pdf_created? && !main_form_fill?
  end

  # Get all deficiencies from this form fill for processing
  def get_deficiencies_for_processing
    return [] unless form_structure.present? && data.present?

    begin
      structure = JSON.parse(form_structure)
      deficiency_fields = structure.select { |field| field['type'] == 'Deficiency' }

      deficiencies_with_data = []

      deficiency_fields.each do |field|
        field_name = field['name']

        # Build deficiency data from the data column
        deficiency_data = {
          'name' => field_name,
          'value' => data["#{field_name}_select"] || '',
          'comment_value' => data["#{field_name}_comment"] || '',
          'Item' => data["#{field_name}_item"] || '',
          'Riser' => data["#{field_name}_riser"] || '',
          'C' => data["#{field_name}_c"] || '',
          'D' => data["#{field_name}_d"] || ''
        }

        # Only include if any field has data
        deficiencies_with_data << deficiency_data if deficiency_data.values.any?(&:present?)
      end

      deficiencies_with_data
    rescue JSON::ParserError => e
      Rails.logger.error "Error parsing form_structure in get_deficiencies_for_processing: #{e.message}"
      []
    end
  end
end
