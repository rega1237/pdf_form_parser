class Api::V1::SyncController < ApplicationController
  before_action :authenticate_user!

  # POST /api/v1/sync
  # Endpoint para sincronizar datos offline con el servidor
  def sync_data
    raw_items = params[:sync_items] || params.dig(:sync, :sync_items) || []
    # Normalizar a Hash con claves símbolo para evitar problemas de acceso
    sync_items = raw_items.map do |item|
      h = item.respond_to?(:to_unsafe_h) ? item.to_unsafe_h : item
      h.deep_symbolize_keys
    end
    results = {
      success: [],
      errors: [],
      conflicts: []
    }

    sync_items.each do |item|
      result = case item[:type]
               when 'form_fill', 'form_fill_update'
                 sync_form_fill(item)
               when 'inspection'
                 sync_inspection(item)
               else
                 { success: false, error: "Tipo de sincronización no soportado: #{item[:type]}" }
               end

      if result[:success]
        results[:success] << {
          local_id: item[:local_id],
          server_id: result[:server_id],
          type: item[:type],
          message: result[:message]
        }
      elsif result[:conflict]
        results[:conflicts] << {
          local_id: item[:local_id],
          server_id: result[:server_id],
          type: item[:type],
          conflict_data: result[:conflict_data],
          message: result[:message]
        }
      else
        results[:errors] << {
          local_id: item[:local_id],
          type: item[:type],
          error: result[:error],
          message: result[:message]
        }
      end
    end

    render json: {
      success: true,
      results: results,
      synced_at: Time.current,
      message: "Sincronización completada: #{results[:success].count} exitosos, #{results[:errors].count} errores, #{results[:conflicts].count} conflictos"
    }, status: :ok
  rescue StandardError => e
    Rails.logger.error "Error en sincronización: #{e.message}"
    render json: {
      success: false,
      error: 'Error interno del servidor',
      message: e.message
    }, status: :internal_server_error
  end

  # POST /api/v1/sync/upload_photo
  # Endpoint para subir fotos desde offline
  def upload_photo
    form_fill_id = params[:form_fill_id]
    field_name = params[:field_name]
    photo_file = params[:photo]

    # Validar parámetros requeridos
    unless form_fill_id && field_name && photo_file
      return render json: {
        success: false,
        error: 'Parámetros requeridos: form_fill_id, field_name, photo'
      }, status: :bad_request
    end

    # Buscar el form_fill
    form_fill = FormFill.find(form_fill_id)

    # Verificar que el usuario tenga acceso
    unless policy(form_fill).update?
      return render json: {
        success: false,
        error: 'No autorizado para actualizar este formulario'
      }, status: :forbidden
    end

    # Procesar la foto
    result = process_photo_upload(form_fill, field_name, photo_file)

    if result[:success]
      render json: {
        success: true,
        photo_attachment_id: result[:attachment_id],
        message: 'Foto subida exitosamente'
      }, status: :ok
    else
      render json: {
        success: false,
        error: result[:error]
      }, status: :unprocessable_entity
    end
  rescue ActiveRecord::RecordNotFound
    render json: {
      success: false,
      error: 'FormFill no encontrado'
    }, status: :not_found
  rescue StandardError => e
    Rails.logger.error "Error subiendo foto: #{e.message}"
    render json: {
      success: false,
      error: 'Error interno del servidor',
      message: e.message
    }, status: :internal_server_error
  end

  # GET /api/v1/sync/status
  # Endpoint para verificar el estado de sincronización
  def sync_status
    # Obtener estadísticas de sincronización del usuario
    user_inspections = policy_scope(Inspection).includes(:form_fills)

    status_data = {
      user_id: current_user.id,
      total_inspections: user_inspections.count,
      pending_inspections: user_inspections.where(status: %w[pending in_progress]).count,
      completed_inspections: user_inspections.where(status: 'completed').count,
      total_form_fills: user_inspections.joins(:form_fills).count,
      last_sync: session[:last_sync_at] || 'Nunca',
      server_time: Time.current
    }

    render json: {
      success: true,
      data: status_data,
      message: 'Estado de sincronización obtenido exitosamente'
    }, status: :ok
  rescue StandardError => e
    Rails.logger.error "Error obteniendo estado de sincronización: #{e.message}"
    render json: {
      success: false,
      error: 'Error interno del servidor',
      message: e.message
    }, status: :internal_server_error
  end

  private

  def sync_form_fill(item)
    form_fill_data = item[:data]

    # Aceptar ambos formatos de payload:
    # - Completo: { id, updated_at, data }
    # - Parcial (patch): { form_fill_id, changes }
    form_fill_id = form_fill_data[:id] || form_fill_data[:form_fill_id]
    form_fill = FormFill.find_by(id: form_fill_id)

    if form_fill
      if form_fill_data[:data].present?
        # Verificar conflictos de versión solo cuando viene updated_at
        if form_fill_data[:updated_at]
          local_time = begin
            Time.zone.parse(form_fill_data[:updated_at].to_s)
          rescue ArgumentError, TypeError
            nil
          end
          if local_time && form_fill.updated_at > local_time
            return {
              success: false,
              conflict: true,
              server_id: form_fill.id,
              conflict_data: {
                server_version: form_fill.updated_at,
                local_version: form_fill_data[:updated_at],
                server_data: form_fill.data,
                local_data: form_fill_data[:data]
              },
              message: 'Conflicto de versión detectado'
            }
          end
        end

        # Actualizar con el dataset completo
        form_fill.update!(
          data: form_fill_data[:data]
        )
      elsif form_fill_data[:changes].present?
        # Aplicar parches (mezclar cambios con los datos existentes)
        form_fill.bulk_update_data(form_fill_data[:changes])
      else
        return {
          success: false,
          error: 'Payload de form_fill incompleto',
          message: 'Se requiere :data o :changes en el payload'
        }
      end

      # Sincronizar fotos si existen
      sync_photos(form_fill, form_fill_data[:photos]) if form_fill_data[:photos]

      {
        success: true,
        server_id: form_fill.id,
        message: 'FormFill actualizado exitosamente'
      }
    else
      {
        success: false,
        error: 'FormFill no encontrado',
        message: "No se encontró el FormFill con ID #{form_fill_id}"
      }
    end
  rescue StandardError => e
    Rails.logger.error "Error sincronizando form_fill: #{e.message}"
    {
      success: false,
      error: 'Error sincronizando FormFill',
      message: e.message
    }
  end

  def sync_inspection(item)
    inspection_data = item[:data]

    # Buscar la inspección existente usando policy_scope
    inspection = policy_scope(Inspection).find_by(id: inspection_data[:id])

    if inspection
      # Verificar conflictos de versión
      if inspection.updated_at > Time.parse(inspection_data[:updated_at])
        return {
          success: false,
          conflict: true,
          server_id: inspection.id,
          conflict_data: {
            server_version: inspection.updated_at,
            local_version: inspection_data[:updated_at]
          },
          message: 'Conflicto de versión detectado en inspección'
        }
      end

      # Actualizar inspección existente
      inspection.update!(
        status: inspection_data[:status],
        notes: inspection_data[:notes]
      )

      {
        success: true,
        server_id: inspection.id,
        message: 'Inspección actualizada exitosamente'
      }
    else
      {
        success: false,
        error: 'Inspección no encontrada',
        message: "No se encontró la inspección con ID #{inspection_data[:id]}"
      }
    end
  rescue StandardError => e
    Rails.logger.error "Error sincronizando inspección: #{e.message}"
    {
      success: false,
      error: 'Error sincronizando inspección',
      message: e.message
    }
  end

  def process_photo_upload(form_fill, field_name, photo_file)
    # Validar que sea una imagen
    unless photo_file.content_type&.start_with?('image/')
      return { success: false, error: 'El archivo debe ser una imagen' }
    end

    # Validar tamaño (máximo 10MB)
    max_size = 10.megabytes
    return { success: false, error: 'El archivo es demasiado grande (máximo 10MB)' } if photo_file.size > max_size

    # Remover foto existente para este campo si existe
    form_fill.remove_photos_for_field(field_name) if form_fill.respond_to?(:remove_photos_for_field)

    # Adjuntar nueva foto
    attachment = form_fill.photos.attach(
      io: photo_file,
      filename: "#{field_name}_#{Time.current.to_i}#{File.extname(photo_file.original_filename)}",
      content_type: photo_file.content_type
    )

    # Actualizar datos del formulario con el ID del attachment
    data = form_fill.data || {}
    data[field_name] = form_fill.photos.last.id
    form_fill.update!(data: data)

    {
      success: true,
      attachment_id: form_fill.photos.last.id
    }
  rescue StandardError => e
    Rails.logger.error "Error procesando subida de foto: #{e.message}"
    {
      success: false,
      error: "Error procesando la foto: #{e.message}"
    }
  end

  def sync_photos(form_fill, photos_data)
    return unless photos_data.is_a?(Array)

    photos_data.each do |photo_data|
      next unless photo_data[:blob_data] # Solo procesar fotos con datos

      begin
        # Decodificar datos base64 de la foto
        decoded_data = Base64.decode64(photo_data[:blob_data])

        # Crear un archivo temporal
        temp_file = Tempfile.new(['photo', '.jpg'])
        temp_file.binmode
        temp_file.write(decoded_data)
        temp_file.rewind

        # Adjuntar la foto al form_fill
        form_fill.photos.attach(
          io: temp_file,
          filename: photo_data[:filename] || "photo_#{Time.current.to_i}.jpg",
          content_type: photo_data[:content_type] || 'image/jpeg'
        )

        temp_file.close
        temp_file.unlink
      rescue StandardError => e
        Rails.logger.error "Error sincronizando foto: #{e.message}"
      end
    end
  end
end
