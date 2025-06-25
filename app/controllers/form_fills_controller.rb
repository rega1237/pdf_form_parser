class FormFillsController < ApplicationController
  def index
    @form_fills = FormFill.all
  end

  def show
    @form_fill = FormFill.find(params[:id])
    @form_template = @form_fill.form_template
    if @form_fill.form_structure.present?
      begin
        @form_fields = JSON.parse(@form_fill.form_structure)
      rescue JSON::ParserError => e
        Rails.logger.error "Failed to parse form_structure for FormFill ##{@form_fill.id}: #{e.message}"
        @form_fields = []
      end
    else
      @form_fields = []
    end
  end

  def new
    @form_fill = FormFill.new
    @form_templates = FormTemplate.all

    @inspections = Inspection.includes(property: :customer)
                             .left_joins(:form_fill)
                             .where(form_fills: { id: nil })
                             .map do |inspection|
      ["#{inspection.property.customer.name} - #{inspection.property.property_name}", inspection.id]
    end

    # Asignar inspection_id si viene en los parámetros
    if params[:inspection_id].present?
      @form_fill.inspection_id = params[:inspection_id]
      inspection = Inspection.find_by(id: @form_fill.inspection_id)
      if inspection && inspection.property
        @form_fill.name = "Inspección ##{inspection.id} - #{inspection.property.property_name}"
      end
    end

    # Asignar form_template_id si viene en los parámetros
    return unless params[:form_template_id].present?

    @form_fill.form_template_id = params[:form_template_id]
    selected_template = FormTemplate.find_by(id: params[:form_template_id])
    @form_fill.form_structure = selected_template.form_structure if selected_template
  end

  def create
    @form_fill = FormFill.new(form_fill_params)
    @form_fill.form_structure = @form_fill.form_template['form_structure']

    if @form_fill.save
      # Si el form_fill está asociado a una inspección, actualizar la inspección
      if @form_fill.inspection_id.present?
        inspection = Inspection.find(@form_fill.inspection_id)
        inspection.update(form_fill_id: @form_fill.id)
        redirect_to inspection_path(inspection), notice: 'Formulario creado exitosamente para la inspección.'
      else
        redirect_to form_fill_path(@form_fill), notice: 'Formulario creado exitosamente.'
      end
    else
      @form_templates = FormTemplate.all
      render :new, status: :unprocessable_entity
    end
  end

  def update
    @form_fill = FormFill.find(params[:id])
    
    # Separar parámetros de fotos de otros parámetros
    update_params = form_fill_params.except(*photo_field_names)
    photo_params = form_fill_params.slice(*photo_field_names)
    
    # Actualizar campos regulares
    if @form_fill.update(update_params)
      # Procesar fotos si las hay
      photo_results = process_photo_uploads(photo_params)
      
      if photo_results[:errors].any?
        render json: { 
          success: false, 
          message: "Formulario guardado pero con errores en fotos: #{photo_results[:errors].join(', ')}" 
        }, status: :unprocessable_entity
      else
        success_message = "Draft saved successfully."
        success_message += " #{photo_results[:uploaded]} photo(s) uploaded." if photo_results[:uploaded] > 0
        
        render json: { success: true, message: success_message }, status: :ok
      end
    else
      render json: { 
        success: false, 
        errors: @form_fill.errors.full_messages, 
        message: 'Could not save draft.' 
      }, status: :unprocessable_entity
    end
  end

  # Endpoint para eliminar foto específica
  def remove_photo
    @form_fill = FormFill.find(params[:id])
    
    # Obtener parámetros del request JSON
    request_data = JSON.parse(request.body.read) rescue {}
    field_name = request_data['field_name'] || params[:field_name]
    
    if field_name.blank?
      render json: { error: "Field name required" }, status: :bad_request
      return
    end
    
    result = @form_fill.remove_photo_for_field(field_name)
    
    if result[:success]
      render json: { 
        success: true, 
        message: result[:message],
        field_name: field_name
      }
    else
      render json: { 
        success: false, 
        error: result[:error],
        field_name: field_name 
      }, status: :unprocessable_entity
    end
  end

  # Endpoint para obtener URL de foto específica
  def photo_url
    @form_fill = FormFill.find(params[:id])
    
    # Obtener parámetros del request JSON
    request_data = JSON.parse(request.body.read) rescue {}
    field_name = request_data['field_name'] || params[:field_name]
    
    if field_name.blank?
      render json: { error: "Field name required" }, status: :bad_request
      return
    end
    
    begin
      photo_url = @form_fill.get_photo_url_for_field(field_name)
      
      render json: { 
        photo_url: photo_url, 
        field_name: field_name,
        success: true
      }
    rescue => e
      Rails.logger.error "Error in photo_url endpoint: #{e.message}"
      render json: { 
        error: "Error getting photo URL: #{e.message}", 
        success: false 
      }, status: :internal_server_error
    end
  end

  # Endpoint para obtener estructura actualizada del formulario
  def structure
    @form_fill = FormFill.find(params[:id])
    
    if @form_fill.form_structure.present?
      begin
        form_fields = JSON.parse(@form_fill.form_structure)
        render json: { 
          form_structure: @form_fill.form_structure,
          form_fields: form_fields,
          success: true
        }
      rescue JSON::ParserError => e
        Rails.logger.error "Failed to parse form_structure for FormFill ##{@form_fill.id}: #{e.message}"
        render json: { 
          error: "Invalid form structure", 
          success: false 
        }, status: :unprocessable_entity
      end
    else
      render json: { 
        form_structure: "[]",
        form_fields: [],
        success: true
      }
    end
  end

  # Método específico para subir fotos via AJAX (opcional, para uso futuro)
  def upload_photo
    @form_fill = FormFill.find(params[:id])
    field_name = params[:field_name]
    photo_file = params[:photo]
    
    if field_name.blank? || photo_file.blank?
      render json: { success: false, error: "Campo o archivo requerido" }, status: :bad_request
      return
    end
    
    result = @form_fill.attach_photo_for_field(field_name, photo_file)
    
    if result[:success]
      render json: { 
        success: true, 
        message: "Photo uploaded successfully",
        attachment_id: result[:attachment_id],
        photo_url: @form_fill.get_photo_url_for_field(field_name)
      }
    else
      render json: { success: false, error: result[:error] }, status: :unprocessable_entity
    end
  end

  def destroy
    @form_fill = FormFill.find(params[:id])
    @form_fill.destroy
    redirect_to form_fills_url, notice: 'Form fill was successfully destroyed.'
  end

  def submit_form
    @form_fill = FormFill.find(params[:id])
    @form_template = @form_fill.form_template

    # Verificar que el template tiene un archivo adjunto
    unless @form_template.original_file.attached?
      flash[:error] = 'No se encontró el archivo PDF del template.'
      redirect_to form_fill_path(@form_fill) and return
    end

    begin
      # Crear directorio temporal para trabajar con los archivos
      temp_dir = Rails.root.join('tmp', 'pdf_forms')
      FileUtils.mkdir_p(temp_dir) unless File.directory?(temp_dir)

      # Descargar el PDF desde Active Storage
      template_pdf_path = File.join(temp_dir, "template_#{@form_template.id}.pdf")
      File.binwrite(template_pdf_path, @form_template.original_file.download)

      # Parsear los datos del formulario
      form_fields = JSON.parse(@form_fill.form_structure)

      # Llenar el PDF con los datos del formulario
      pdf_service = PdfFormsParserService.new(template_pdf_path)
      filled_pdf_filename = "#{@form_fill.name.parameterize}.pdf"
      filled_pdf_path = File.join(temp_dir, filled_pdf_filename)
      pdf_service.fill_form(filled_pdf_path, form_fields)

      # Adjuntar el PDF rellenado a través de Active Storage
      @form_fill.filled_pdf.attach(
        io: File.open(filled_pdf_path),
        filename: filled_pdf_filename,
        content_type: 'application/pdf'
      )

      # Limpiar archivos temporales
      FileUtils.rm_f(template_pdf_path)
      FileUtils.rm_f(filled_pdf_path)

      flash[:success] = 'Formulario enviado y PDF generado correctamente.'
      redirect_to form_fill_path(@form_fill)
    rescue StandardError => e
      Rails.logger.error "Error al procesar el formulario PDF: #{e.message}"
      Rails.logger.error e.backtrace.join("\n")
      flash[:error] = "Error al procesar el formulario: #{e.message}"
      redirect_to form_fill_path(@form_fill)
    end
  end

  private

  def set_form_fill
    @form_fill = FormFill.find(params[:id])
  end

  def form_fill_params
    params.require(:form_fill).permit(:name, :form_template_id, :form_structure, :inspection_id, photo_field_params)
  end
  
  # Método para obtener nombres de campos de tipo Photo dinámicamente
  def photo_field_names
    return [] unless params[:form_fill]
    
    # Buscar campos que terminen con extensiones de archivo de imagen
    photo_fields = params[:form_fill].keys.select do |key|
      params[:form_fill][key].respond_to?(:content_type) && 
      params[:form_fill][key].content_type&.start_with?('image/')
    end
    
    photo_fields
  end
  
  # Método para obtener parámetros de campos Photo dinámicamente
  def photo_field_params
    return {} unless @form_fill&.form_structure.present?
    
    begin
      structure = JSON.parse(@form_fill.form_structure)
      photo_fields = structure.select { |field| field['type'] == 'Photo' }.map { |field| field['name'] }
      photo_fields
    rescue JSON::ParserError
      []
    end
  end
  
  # Método para procesar subidas de fotos
  def process_photo_uploads(photo_params)
    results = { uploaded: 0, errors: [] }
    
    photo_params.each do |field_name, photo_file|
      next if photo_file.blank?
      
      result = @form_fill.attach_photo_for_field(field_name, photo_file)
      
      if result[:success]
        results[:uploaded] += 1
        Rails.logger.info "Photo uploaded for field: #{field_name}"
      else
        results[:errors] << "#{field_name}: #{result[:error]}"
        Rails.logger.error "Failed to upload photo for field #{field_name}: #{result[:error]}"
      end
    end
    
    results
  end
end