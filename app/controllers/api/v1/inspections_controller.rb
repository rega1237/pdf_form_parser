class Api::V1::InspectionsController < ApplicationController
  before_action :authenticate_user!
  before_action :set_inspection, only: [:offline_data]
  
  # GET /api/v1/inspections/:id/offline_data
  # Endpoint para obtener todos los datos necesarios de una inspección para uso offline
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
        form_fills: [],
        form_templates: []
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
          photos: form_fill.photos.attached? ? form_fill.photos.map { |photo|
            {
              id: photo.id,
              filename: photo.filename.to_s,
              content_type: photo.content_type,
              byte_size: photo.byte_size,
              url: url_for(photo)
            }
          } : []
        }
        
        inspection_data[:form_fills] << form_fill_data
        
        # Agregar template si no está ya incluido
        template = form_fill.form_template
        unless inspection_data[:form_templates].any? { |t| t[:id] == template.id }
          template_data = {
            id: template.id,
            name: template.name,
            form_structure: template.form_structure,
            created_at: template.created_at,
            updated_at: template.updated_at
          }
          inspection_data[:form_templates] << template_data
        end
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
        message: 'Datos de inspección obtenidos exitosamente'
      }, status: :ok
      
    rescue => e
      Rails.logger.error "Error obteniendo datos offline para inspección #{params[:id]}: #{e.message}"
      render json: {
        success: false,
        error: 'Error interno del servidor',
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
      error: 'Inspección no encontrada',
      message: 'La inspección solicitada no existe o no tienes permisos para acceder a ella'
    }, status: :not_found
  end
  
  def generate_checksum(data)
    Digest::MD5.hexdigest(data.to_json)
  end
end