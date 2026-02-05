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
    puts "[DEBUG] Generated suffix: #{random_suffix}"
    "inspection_#{inspection.id}_#{parameterized_name}_#{random_suffix}"
  end

  # Método para adjuntar foto a un campo específico (soporta múltiples fotos)
  def attach_photo_for_field(field_name, photo_file)
    return { success: false, error: 'Campo o archivo vacío' } if field_name.blank? || photo_file.blank?

    begin
      # 1. Parsear la estructura para encontrar el section_name y tipo
      structure = JSON.parse(form_structure)
      field_data = structure.find { |field| field['name'] == field_name }

      # Si el campo es de tipo Signature técnico en campo o anexo de cliente, usar la lógica especial de firma
      if %w[Signature Signature_Field Signature_Annex].include?(field_data&.dig('type').to_s)
        return attach_signature_for_field(field_name, photo_file)
      end

      # Usar el section_name si existe, de lo contrario, usar el field_name como fallback
      field_section = field_data&.dig('section_name').presence || field_name

      # 2. NO eliminar fotos existentes, para permitir múltiples

      # 3. Generar el ID único usando el section_name
      unique_attachment_id = generate_unique_photo_attachment_id(field_section)
      return { success: false, error: 'No se pudo generar ID único' } if unique_attachment_id.blank?

      # 4. Adjuntar la nueva foto con el nombre de archivo basado en el section_name
      photos.attach(
        io: photo_file,
        filename: "#{unique_attachment_id}.jpg",
        content_type: photo_file.content_type || 'image/jpeg'
      )

      # 5. Actualizar la estructura del formulario añadiendo el ID del adjunto a la lista
      success = add_photo_attachment_id_to_structure(field_name, unique_attachment_id)

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

  # =============================
  # FIRMA: LÓGICA ESPECIAL
  # =============================
  def generate_unique_signature_attachment_id(field_section, field_name, field_type = nil)
    return nil if field_name.blank? || inspection.blank?

    # Usar el tipo de campo para determinar si es técnico o cliente
    # Signature_Field = técnico, Signature_Annex = cliente
    signature_type = case field_type&.to_s
                     when 'Signature_Field'
                       'technician'
                     when 'Signature_Annex'
                       'client'
                     else
                       # Fallback: usar el nombre del campo si no hay tipo
                       field_name.to_s.downcase.include?('client') ? 'client' : 'technician'
                     end

    random_suffix = SecureRandom.hex(4)
    # Formato: inspection_<id>_signature_<type>_<hex>
    "inspection_#{inspection.id}_signature_#{signature_type}_#{random_suffix}.png"
  end

  # Adjuntar imagen de firma para un campo de tipo Signature
  def attach_signature_for_field(field_name, image_file)
    return { success: false, error: 'Campo o archivo vacío' } if field_name.blank? || image_file.blank?

    begin
      structure = JSON.parse(form_structure)
      field_data = structure.find { |field| field['name'] == field_name }
      # Aceptar tanto "Signature" como "Signature_Field" y "Signature_Annex"
      unless %w[Signature Signature_Field Signature_Annex].include?(field_data&.dig('type').to_s)
        return { success: false,
                 error: 'The field is not type Signature/Signature_Field/Signature_Annex' }
      end

      # Validación de tipo MIME (solo PNG/JPEG para preservar calidad original)
      allowed_types = ['image/png', 'image/jpeg']
      content_type = image_file.content_type || 'image/jpeg'
      unless allowed_types.include?(content_type)
        return { success: false, error: 'Tipo de archivo no permitido para firma. Use PNG o JPEG.' }
      end

      # Evitar duplicados: eliminar cualquier firma previa del mismo campo
      remove_all_signatures_for_field(field_name)

      field_section = field_data&.dig('section_name').presence || field_name
      field_type = field_data&.dig('type')
      unique_attachment_id = generate_unique_signature_attachment_id(field_name, field_section, field_type)
      return { success: false, error: 'No se pudo generar ID único de firma' } if unique_attachment_id.blank?

      # Adjuntar sin alterar el binario (mantener calidad original)
      photos.attach(
        io: image_file,
        filename: unique_attachment_id,
        content_type: content_type
      )

      success = update_signature_attachment_id_in_structure(field_name, unique_attachment_id)

      if success
        Rails.logger.info "Signature attached for field: #{field_name} with ID: #{unique_attachment_id}"
        { success: true, attachment_id: unique_attachment_id }
      else
        { success: false, error: 'Error al actualizar estructura del formulario para la firma' }
      end
    rescue JSON::ParserError => e
      Rails.logger.error "Error parsing form_structure (signature): #{e.message}"
      { success: false, error: 'Error al parsear la estructura del formulario' }
    rescue StandardError => e
      Rails.logger.error "Error attaching signature for field #{field_name}: #{e.message}"
      { success: false, error: e.message }
    end
  end

  # Eliminar TODAS las firmas de un campo Signature específico
  def remove_all_signatures_for_field(field_name)
    return if field_name.blank? || !photos.attached?

    begin
      signatures_to_remove = []

      # 1) Preferir eliminación por attachment_id exacto si está guardado en data
      stored_attachment_id = begin
        get_field_value("#{field_name}_signature_attachment_id")
      rescue StandardError
        nil
      end
      if stored_attachment_id.present?
        signatures_to_remove += photos.select { |photo| photo.filename.to_s.start_with?(stored_attachment_id) }
      else
        # 2) Si no hay attachment_id, eliminar por prefijo específico de sección + nombre de campo
        structure = JSON.parse(form_structure) if form_structure.present?
        field_data = structure&.find { |field| field['name'] == field_name }
        field_section = field_data&.dig('section_name').presence || field_name
        safe_section_name = field_section.gsub('|', '__')
        parameterized_section = safe_section_name.parameterize.underscore

        safe_field_name = field_name.to_s.gsub('|', '__')
        parameterized_field = safe_field_name.parameterize.underscore

        specific_prefix = "inspection_#{inspection.id}_signature_#{parameterized_section}_#{parameterized_field}_"
        signatures_to_remove += photos.select { |photo| photo.filename.to_s.start_with?(specific_prefix) }
      end

      signatures_to_remove.uniq.each do |sig|
        Rails.logger.info "Removing signature for field '#{field_name}': #{sig.filename} (id=#{sig.id})"
        sig.purge
      end
      Rails.logger.info "Removed #{signatures_to_remove.uniq.count} signatures for field: #{field_name}"
    rescue StandardError => e
      Rails.logger.error "Error removing signatures for field #{field_name}: #{e.message}"
    end
  end

  def update_signature_attachment_id_in_structure(field_name, attachment_id)
    return false if field_name.blank?

    begin
      signature_data_key = "#{field_name}_signature_attachment_id"
      set_field_value(signature_data_key, attachment_id)
      Rails.logger.info "Updated signature attachment ID for field '#{field_name}': #{attachment_id}"
      true
    rescue StandardError => e
      Rails.logger.error "Error updating signature attachment ID for field #{field_name}: #{e.message}"
      false
    end
  end

  def get_signature_for_field(field_name)
    return nil if field_name.blank?

    begin
      Rails.logger.info "Searching for signature for field: #{field_name}"

      signature_data_key = "#{field_name}_signature_attachment_id"
      attachment_id = get_field_value(signature_data_key)
      if attachment_id.present?
        found = photos.find { |p| p.filename.to_s.start_with?(attachment_id) }
        Rails.logger.info "Found signature via attachment_id for #{field_name}: #{found&.filename}" if found
        return found if found
      end

      # Fallback: buscar por tipo de campo (Signature_Field vs Signature_Annex)
      structure = JSON.parse(form_structure) if form_structure.present?
      field_data = structure&.find { |f| f['name'] == field_name }

      # Determine signature type based on field type ONLY
      field_type = field_data&.dig('type').to_s
      is_technician_field = field_type == 'Signature_Field'
      is_client_field = field_type == 'Signature_Annex'

      Rails.logger.info "Searching for signature - Field type: #{field_type}, is_technician: #{is_technician_field}, is_client: #{is_client_field}"
      Rails.logger.info "Available photos: #{photos.map(&:filename).join(', ')}" if photos.attached?

      # Buscar por prefijo basado en tipo (nuevo formato simplificado)
      if is_technician_field
        # Buscar firmas de técnico
        technician_candidates = photos.select { |p| p.filename.to_s.include?('signature_technician') }
        if technician_candidates.any?
          candidate = technician_candidates.first
          Rails.logger.info "Found technician signature: #{candidate&.filename}"
          return candidate
        end
        # Si no hay firmas de técnico, no buscar firmas de cliente
        Rails.logger.info "No technician signatures found for technician field #{field_name}"
        return nil
      elsif is_client_field
        # Buscar firmas de cliente
        client_candidates = photos.select { |p| p.filename.to_s.include?('signature_client') }
        if client_candidates.any?
          candidate = client_candidates.first
          Rails.logger.info "Found client signature: #{candidate&.filename}"
          return candidate
        end
        # Si no hay firmas de cliente, no buscar firmas de técnico
        Rails.logger.info "No client signatures found for client field #{field_name}"
        return nil
      end

      # Fallback para compatibilidad con archivos antiguos (formato anterior)
      Rails.logger.info 'No signature found with new format, trying legacy format...'

      field_section = field_data&.dig('section_name').presence || field_name
      safe_section_name = field_section.gsub('|', '__')
      parameterized_section = safe_section_name.parameterize.underscore

      safe_field_name = field_name.to_s.gsub('|', '__')
      parameterized_field = safe_field_name.parameterize.underscore

      specific_prefix = "inspection_#{inspection.id}_signature_#{parameterized_section}_#{parameterized_field}_"
      section_only_prefix = "inspection_#{inspection.id}_signature_#{parameterized_section}_"
      legacy_prefix = "inspection_#{inspection.id}_#{parameterized_section}_"

      # Intentar búsquedas en orden de especificidad, pero filtrar por tipo
      candidate = photos.find { |p| p.filename.to_s.start_with?(specific_prefix) }
      Rails.logger.info "Found via specific prefix: #{candidate&.filename}" if candidate

      if candidate.nil? && section_only_prefix.present?
        section_candidates = photos.select { |p| p.filename.to_s.start_with?(section_only_prefix) }

        # Filtrar por tipo de firma en archivos legacy
        if is_technician_field
          candidate = section_candidates.find { |p| p.filename.to_s.include?('technician') }
          Rails.logger.info "Found technician signature via section prefix: #{candidate&.filename}" if candidate
          # Si no hay firmas technician en esta sección, no usar firmas cliente
          if candidate.nil? && section_candidates.any?
            Rails.logger.info "Found section candidates but rejected (not technician signatures): #{section_candidates.map(&:filename).join(', ')}"
            return nil
          end
        elsif is_client_field
          candidate = section_candidates.find { |p| p.filename.to_s.include?('client') }
          Rails.logger.info "Found client signature via section prefix: #{candidate&.filename}" if candidate
          # Si no hay firmas cliente en esta sección, no usar firmas technician
          if candidate.nil? && section_candidates.any?
            Rails.logger.info "Found section candidates but rejected (not client signatures): #{section_candidates.map(&:filename).join(', ')}"
            return nil
          end
        else
          candidate = section_candidates.first
          Rails.logger.info "Found via section prefix: #{candidate&.filename}" if candidate
        end
      end

      if candidate.nil? && legacy_prefix.present?
        legacy_candidates = photos.select { |p| p.filename.to_s.include?(legacy_prefix) }

        # Filtrar por tipo de firma en archivos legacy
        if is_technician_field
          candidate = legacy_candidates.find { |p| p.filename.to_s.include?('technician') }
          Rails.logger.info "Found technician signature via legacy prefix: #{candidate&.filename}" if candidate
          # Si no hay firmas technician con este prefijo, no usar firmas cliente
          if candidate.nil? && legacy_candidates.any?
            Rails.logger.info "Found legacy candidates but rejected (not technician signatures): #{legacy_candidates.map(&:filename).join(', ')}"
            return nil
          end
        elsif is_client_field
          candidate = legacy_candidates.find { |p| p.filename.to_s.include?('client') }
          Rails.logger.info "Found client signature via legacy prefix: #{candidate&.filename}" if candidate
          # Si no hay firmas cliente con este prefijo, no usar firmas technician
          if candidate.nil? && legacy_candidates.any?
            Rails.logger.info "Found legacy candidates but rejected (not client signatures): #{legacy_candidates.map(&:filename).join(', ')}"
            return nil
          end
        else
          candidate = legacy_candidates.first
          Rails.logger.info "Found via legacy prefix: #{candidate&.filename}" if candidate && !candidate.nil?
        end
      end

      Rails.logger.info "Final result for #{field_name}: #{candidate&.filename || 'not found'}"
      candidate
    rescue StandardError => e
      Rails.logger.error "Error getting signature for field #{field_name}: #{e.message}"
      nil
    end
  end

  def clear_signature_attachment_id_in_structure(field_name)
    return false if field_name.blank?

    begin
      signature_data_key = "#{field_name}_signature_attachment_id"
      set_field_value(signature_data_key, nil)
      Rails.logger.info "Cleared signature attachment ID for field '#{field_name}'"
      true
    rescue StandardError => e
      Rails.logger.error "Error clearing signature attachment ID for field #{field_name}: #{e.message}"
      false
    end
  end

  # Método para añadir un ID de foto a la estructura (soporta múltiples)
  def add_photo_attachment_id_to_structure(field_name, attachment_id)
    return false if field_name.blank?

    begin
      photo_data_key = "#{field_name}_photo_attachment_id"
      current_value = get_field_value(photo_data_key)

      # Normalizar a array
      ids = if current_value.is_a?(Array)
              current_value
            elsif current_value.present?
              [current_value]
            else
              []
            end

      # Añadir si no existe
      unless ids.include?(attachment_id)
        ids << attachment_id
        puts "[DEBUG] Saving ids: #{ids.inspect}"
        set_field_value(photo_data_key, ids)
      end

      Rails.logger.info "Added photo attachment ID for field '#{field_name}': #{attachment_id}. Total: #{ids.count}"
      true
    rescue StandardError => e
      Rails.logger.error "Error adding photo attachment ID for field #{field_name}: #{e.message}"
      false
    end
  end

  # Deprecated: Alias para compatibilidad si es necesario, pero preferible usar add_...
  def update_photo_attachment_id_in_structure(field_name, attachment_id)
    add_photo_attachment_id_to_structure(field_name, attachment_id)
  end

  # Método para obtener foto por campo (Devuelve la ÚLTIMA foto para compatibilidad)
  def get_photo_for_field(field_name)
    photos = get_photos_for_field(field_name)
    photos.last
  end

  # Nuevo método: Obtener todas las fotos de un campo
  def get_photos_for_field(field_name)
    return [] if field_name.blank?

    begin
      photo_data_key = "#{field_name}_photo_attachment_id"
      attachment_ids = get_field_value(photo_data_key)

      # Rails.logger.info "[DEBUG] get_photos_for_field #{field_name}: IDs found in data: #{attachment_ids.inspect}"

      # Normalizar a array de strings
      target_ids = if attachment_ids.is_a?(Array)
                     attachment_ids.map(&:to_s)
                   elsif attachment_ids.present?
                     [attachment_ids.to_s]
                   else
                     []
                   end

      return [] if target_ids.empty?

      # Buscar fotos que comiencen con alguno de los IDs
      photos.select do |photo|
        target_ids.any? { |id| photo.filename.to_s.start_with?(id) }
      end

      # Rails.logger.info "[DEBUG] get_photos_for_field #{field_name}: Photos found in ActiveStorage: #{found_photos.count}"
    rescue StandardError => e
      Rails.logger.error "Error getting photos for field #{field_name}: #{e.message}"
      []
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

      # Handle array or single value
      attachment_ids = value.is_a?(Array) ? value : [value]

      Rails.logger.info "[DEBUG] get_photos_by_field: Field '#{field_name}' has IDs: #{attachment_ids.inspect}"

      field_photos = attachment_ids.filter_map do |attachment_id|
        photo = photos.find { |p| p.filename.to_s.start_with?(attachment_id) }
        unless photo
          Rails.logger.warn "[DEBUG] Warning: Photo with ID prefix '#{attachment_id}' listed in data but not found in ActiveStorage attachments."
        end
        next unless photo

        {
          photo: photo,
          attachment_id: attachment_id
        }
      end

      photos_hash[field_name] = field_photos if field_photos.any?
    end

    Rails.logger.info "[DEBUG] get_photos_by_field: Total fields with photos: #{photos_hash.keys.count}. Total photos: #{photos_hash.values.flatten.count}"

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
  def remove_photo_for_field(field_name, photo_id = nil)
    return { success: false, error: 'Campo vacío' } if field_name.blank?

    begin
      if photo_id.present?
        remove_specific_photo(field_name, photo_id)
      else
        # Usar el método que elimina todas las fotos del campo
        remove_all_photos_for_field(field_name)

        # Actualizar form_structure para limpiar photo_attachment_id
        success = clear_photo_attachment_id_in_structure(field_name)

        if success
          Rails.logger.info "Photo removed completely for field: #{field_name}"
          { success: true, message: 'Photo removed successfully' }
        else
          { success: false, error: 'Error updating form structure' }
        end
      end
    rescue StandardError => e
      Rails.logger.error "Error removing photo for field #{field_name}: #{e.message}"
      { success: false, error: e.message }
    end
  end

  def remove_specific_photo(field_name, photo_id)
    # 1. Find photo
    photo = photos.find { |p| p.filename.to_s.start_with?(photo_id) }

    if photo
      photo.purge
    else
      Rails.logger.warn "Photo not found for removal: #{photo_id}"
    end

    # 2. Remove from data array
    photo_data_key = "#{field_name}_photo_attachment_id"
    current_value = get_field_value(photo_data_key)

    ids = if current_value.is_a?(Array)
            current_value
          else
            (current_value.present? ? [current_value] : [])
          end

    if ids.include?(photo_id)
      ids.delete(photo_id)
      set_field_value(photo_data_key, ids)
      Rails.logger.info "Removed photo ID #{photo_id} from field #{field_name}"
    end

    { success: true, message: 'Photo removed successfully' }
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
        collection_json = data["#{field_name}_collection"]

        if collection_json.present?
          begin
            collection = JSON.parse(collection_json)
            if collection.is_a?(Array)
              collection.each do |item|
                deficiencies_with_data << {
                  'name' => field_name,
                  'value' => item['value'] || '',
                  'comment_value' => item['comment_value'] || '',
                  'Item' => item['Item'] || '',
                  'Riser' => item['Riser'] || '',
                  'C' => item['C'] || '',
                  'D' => item['D'] || ''
                }
              end
            end
          rescue JSON::ParserError => e
            Rails.logger.warn "Error parsing deficiency collection for #{field_name}: #{e.message}"
            # Fallback to single deficiency logic if parsing fails
            deficiencies_with_data << build_single_deficiency_data(field_name)
          end
        else
          # Fallback for legacy data or single deficiency
          deficiencies_with_data << build_single_deficiency_data(field_name)
        end
      end

      # Filter out empty deficiencies
      deficiencies_with_data.select { |d| d.values.any?(&:present?) }
    rescue JSON::ParserError => e
      Rails.logger.error "Error parsing form_structure in get_deficiencies_for_processing: #{e.message}"
      []
    end
  end

  def build_single_deficiency_data(field_name)
    {
      'name' => field_name,
      'value' => data["#{field_name}_select"] || '',
      'comment_value' => data["#{field_name}_comment"] || '',
      'Item' => data["#{field_name}_item"] || '',
      'Riser' => data["#{field_name}_riser"] || '',
      'C' => data["#{field_name}_c"] || '',
      'D' => data["#{field_name}_d"] || ''
    }
  end

  def get_photos_with_context
    return [] unless form_structure.present? && photos.attached?

    begin
      structure_map = JSON.parse(form_structure).index_by { |field| field['name'] }
      photos_by_field = get_photos_by_field # Usamos el método que ya existe

      # Create a case-insensitive map as fallback
      structure_map_ci = structure_map.transform_keys(&:downcase)

      photos_by_field.flat_map do |field_name, photo_list|
        # Try exact match first, then case-insensitive
        field_info = structure_map[field_name] || structure_map_ci[field_name.downcase]

        unless field_info
          Rails.logger.warn "[DEBUG] get_photos_with_context: Field '#{field_name}' not found in form_structure (checked case-insensitive). Skipping #{photo_list.count} photos."
          # Optional: List similar keys to help debugging
          similar_keys = structure_map.keys.select { |k| k.downcase.include?(field_name.downcase) }
          if similar_keys.any?
            Rails.logger.warn "[DEBUG] get_photos_with_context: Did you mean one of these? #{similar_keys.join(', ')}"
          end
          next []
        end

        unless %w[Photo pass_photo].include?(field_info['type'])
          Rails.logger.warn "[DEBUG] get_photos_with_context: Field '#{field_name}' has type '#{field_info['type']}', but has photo attachments. Including it."
          # We allow it to proceed, assuming if it has a photo attachment, it should be included.
        end

        # Normalizar a array y mapear
        Array(photo_list).map do |photo_data|
          {
            photo: photo_data[:photo],
            field_type: field_info['type'], # 'Photo' o 'pass_photo'
            section_name: field_info['section_name'],
            label_name: field_info['label_name']
          }
        end
      end.compact
    rescue JSON::ParserError => e
      Rails.logger.error "Error parsing form_structure in get_photos_with_context: #{e.message}"
      []
    end
  end
end
