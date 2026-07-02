class Api::V1::InspectionsController < ApplicationController
  before_action :authenticate_user!
  before_action :set_inspection, only: [ :offline_data ]

  # GET /api/v1/inspections/:id/offline_data
  # Endpoint para obtener todos los datos necesarios de una inspección para uso offline
  # MODIFICACIÓN Offline-First: Embebe form_structure dentro de cada form_fill y elimina
  # el envío de estructuras separadas. Esto asegura que la app siempre renderice desde
  # un único objeto (form_fill) almacenado en IndexedDB.
  def offline_data
    begin
      # Obtener datos completos de la inspección
      inspection_data = {
        inspection: {
          id: @inspection.id,
          date: @inspection.date,
          notes: @inspection.notes,
          status: @inspection.status,
          system_category: @inspection.system_category,
          interval_category: @inspection.interval_category,
          job: @inspection.job,
          created_at: @inspection.created_at,
          updated_at: @inspection.updated_at,
          property: {
            id: @inspection.property.id,
            property_name: @inspection.property.property_name,
            address: @inspection.property.address,
            city: @inspection.property.city,
            zip_code: @inspection.property.zip_code
          },
          customer: {
            id: @inspection.property.customer.id,
            name: @inspection.property.customer.name,
            email: @inspection.property.customer.email,
            phone_1: @inspection.property.customer.phone_1,
            phone_2: @inspection.property.customer.phone_2
          },
          form_template: {
            id: @inspection.form_template.id,
            name: @inspection.form_template.name
          }
        },
        form_fills: []
      }

      # Obtener todos los form_fills asociados con sus datos
      @inspection.form_fills.includes(:form_template).each do |form_fill|
        form_fill_data = {
          id: form_fill.id,
          inspection_id: form_fill.inspection_id,
          form_template_id: form_fill.form_template_id,
          pdf_generation_status: form_fill.pdf_generation_status,
          data: form_fill.data,
          created_at: form_fill.created_at,
          updated_at: form_fill.updated_at,
          # Embebemos la estructura del formulario directamente en el form_fill
          form_structure: form_fill.form_template&.form_structure,
          photos: begin
            active_photos = []
            if form_fill.photos.attached?
              # 1. Active photos referenced in data column
              form_fill.get_photos_by_field.each do |_field_name, field_photos|
                field_photos.each do |fp|
                  active_photos << fp[:photo] if fp[:photo].present?
                end
              end

              # 2. Active signatures referenced in data column
              (form_fill.data || {}).each do |key, value|
                if key.to_s.end_with?("_signature_attachment_id") && value.present?
                  sig_photo = form_fill.photos.find { |p| p.filename.to_s.start_with?(value.to_s) }
                  active_photos << sig_photo if sig_photo.present?
                end
              end
            end
            active_photos.uniq.map { |photo|
              {
                id: photo.id,
                filename: photo.filename.to_s,
                content_type: photo.content_type,
                byte_size: photo.byte_size,
                url: rails_storage_proxy_path(photo, only_path: true)
              }
            }
          end
        }

        inspection_data[:form_fills] << form_fill_data
      end

      # Agregar metadatos para sincronización
      inspection_data[:sync_metadata] = {
        downloaded_at: Time.current,
        version: 1,
        checksum: generate_checksum(inspection_data)
      }

      render json: {
        success: true,
        data: inspection_data,
        message: "Datos de inspección obtenidos exitosamente"
      }, status: :ok
    rescue => e
      Rails.logger.error "Error obteniendo datos offline para inspección #{params[:id]}: #{e.message}"
      render json: {
        success: false,
        error: "Error interno del servidor",
        message: e.message
      }, status: :internal_server_error
    end
  end

  private

  def set_inspection
    @inspection = policy_scope(Inspection).find(params[:id])
  rescue ActiveRecord::RecordNotFound
    render json: {
      success: false,
      error: "InspectionNotFound",
      message: "The requested inspection does not exist or you do not have permission to access it"
    }, status: :not_found
  end

  def generate_checksum(data)
    Digest::MD5.hexdigest(data.to_json)
  end
end
