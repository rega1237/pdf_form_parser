class FormFillsController < ApplicationController
  def index
    @form_fills = FormFill.all
  end

  def show
    @form_fill = FormFill.find(params[:id])
    @deficiencies = Deficiency.order(:name).all
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

    # Procesar campos de deficiency antes de la actualización
    process_deficiency_fields(update_params)

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
        success_message = 'Draft saved successfully.'
        success_message += " #{photo_results[:uploaded]} photo(s) uploaded." if photo_results[:uploaded] > 0
        success_message += " #{photo_results[:skipped]} photo(s) skipped (already saved)." if photo_results[:skipped] > 0

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
    request_data = begin
      JSON.parse(request.body.read)
    rescue StandardError
      {}
    end
    field_name = request_data['field_name'] || params[:field_name]

    if field_name.blank?
      render json: { error: 'Field name required' }, status: :bad_request
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
    request_data = begin
      JSON.parse(request.body.read)
    rescue StandardError
      {}
    end
    field_name = request_data['field_name'] || params[:field_name]

    if field_name.blank?
      render json: { error: 'Field name required' }, status: :bad_request
      return
    end

    begin
      photo_url = @form_fill.get_photo_url_for_field(field_name)

      render json: {
        photo_url: photo_url,
        field_name: field_name,
        success: true
      }
    rescue StandardError => e
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
          error: 'Invalid form structure',
          success: false
        }, status: :unprocessable_entity
      end
    else
      render json: {
        form_structure: '[]',
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
      render json: { success: false, error: 'Campo o archivo requerido' }, status: :bad_request
      return
    end

    result = @form_fill.attach_photo_for_field(field_name, photo_file)

    if result[:success]
      render json: {
        success: true,
        message: 'Photo uploaded successfully',
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
    @main_form_fill = FormFill.find(params[:id])
    
    # Verificar si ya se está generando un PDF
    if @main_form_fill.generating?
      redirect_to @main_form_fill, alert: 'PDF is already being generated. Please wait.'
      return
    end
    
    # Marcar como generando antes de encolar el trabajo
    @main_form_fill.update!(pdf_generation_status: 'generating')
  
    # Encolar el trabajo de generación de PDF
    GeneratePdfJob.perform_later(@main_form_fill.id)
  
    # Redirigir al usuario con un mensaje informativo
    redirect_to @main_form_fill, notice: 'Your PDF is being generated and will be available shortly.'
  end

  def download_pdf
    @form_fill = FormFill.find(params[:id])
    
    if @form_fill.filled_pdf.attached?
      # Usar send_data para servir el archivo directamente
      send_data @form_fill.filled_pdf.download,
                filename: @form_fill.filled_pdf.filename.to_s,
                type: @form_fill.filled_pdf.content_type,
                disposition: params[:disposition] || 'inline'
    else
      redirect_to @form_fill, alert: 'PDF not found or not yet generated.'
    end
  rescue StandardError => e
    Rails.logger.error "Error downloading PDF for FormFill ##{@form_fill.id}: #{e.message}"
    redirect_to @form_fill, alert: 'Error accessing PDF file.'
  end

  private

  def form_fill_params
    # Obtener los parámetros básicos
    basic_params = params.require(:form_fill).permit(:name, :form_template_id, :form_structure, :inspection_id)

    # Obtener campos de foto dinámicamente
    photo_params = photo_field_params

    # Obtener campos de deficiency dinámicamente
    deficiency_params = deficiency_field_params

    # Combinar todos los parámetros
    basic_params.merge(photo_params).merge(deficiency_params)
  end

  # Método para obtener nombres de campos de tipo Photo dinámicamente
  def photo_field_names
    return [] unless params[:form_fill]

    # Buscar campos que terminen con extensiones de archivo de imagen
    params[:form_fill].keys.select do |key|
      params[:form_fill][key].respond_to?(:content_type) &&
        params[:form_fill][key].content_type&.start_with?('image/')
    end
  end

  # Método para obtener parámetros de campos Photo dinámicamente
  def photo_field_params
    return {} unless @form_fill&.form_structure.present?

    begin
      structure = JSON.parse(@form_fill.form_structure)
      photo_fields = structure.select { |field| field['type'] == 'Photo' }.map { |field| field['name'] }

      # Permitir estos campos en los parámetros
      begin
        params.require(:form_fill).permit(photo_fields)
      rescue StandardError
        {}
      end
    rescue JSON::ParserError
      {}
    end
  end

  # Método para obtener parámetros de campos Deficiency dinámicamente
  def deficiency_field_params
    deficiency_params = {}

    # Si no hay form_fill aún (como en create), intentar obtener de form_template
    structure_source = @form_fill&.form_structure ||
                       (if params[:form_fill][:form_template_id].present?
                          FormTemplate.find_by(id: params[:form_fill][:form_template_id])&.form_structure
                        else
                          nil
                        end)

    return {} unless structure_source.present?

    begin
      structure = JSON.parse(structure_source)
      deficiency_fields = structure.select { |field| field['type'] == 'Deficiency' }

      deficiency_fields.each do |field|
        field_name = field['name']

        # Permitir todos los subcampos de deficiency
        deficiency_params["#{field_name}_select"] = params.dig(:form_fill, "#{field_name}_select")
        deficiency_params["#{field_name}_comment"] = params.dig(:form_fill, "#{field_name}_comment")
        deficiency_params["#{field_name}_item"] = params.dig(:form_fill, "#{field_name}_item")
        deficiency_params["#{field_name}_riser"] = params.dig(:form_fill, "#{field_name}_riser")
        deficiency_params["#{field_name}_c"] = params.dig(:form_fill, "#{field_name}_c")
        deficiency_params["#{field_name}_d"] = params.dig(:form_fill, "#{field_name}_d")
      end

      # Filtrar parámetros nulos
      deficiency_params.compact
    rescue JSON::ParserError => e
      Rails.logger.error "Error parsing form structure for deficiency params: #{e.message}"
      {}
    end
  end

  # Método para procesar subidas de fotos (solo fotos nuevas)
  def process_photo_uploads(photo_params)
    results = { uploaded: 0, errors: [], skipped: 0 }

    photo_params.each do |field_name, photo_file|
      next if photo_file.blank?

      # Verificar si ya existe una foto para este campo
      if photo_already_exists_for_field?(field_name, photo_file)
        results[:skipped] += 1
        Rails.logger.info "Skipping photo upload for field #{field_name} - already exists"
        next
      end

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

  # Método para verificar si ya existe una foto para un campo
  def photo_already_exists_for_field?(field_name, new_photo_file)
    return false unless @form_fill.form_structure.present?

    begin
      structure = JSON.parse(@form_fill.form_structure)
      field_data = structure.find { |field| field['name'] == field_name && field['type'] == 'Photo' }
      
      # Si el campo tiene photo_attachment_id, significa que ya tiene una foto guardada
      has_existing_photo = field_data&.dig('photo_attachment_id').present?
      
      if has_existing_photo
        # Verificar que la foto realmente existe en Active Storage
        existing_photo = @form_fill.get_photo_for_field(field_name)
        return existing_photo.present?
      end
      
      false
    rescue JSON::ParserError => e
      Rails.logger.error "Error checking existing photo for field #{field_name}: #{e.message}"
      false
    end
  end

  def process_deficiency_fields(update_params)
    return unless update_params[:form_structure].present?

    begin
      # Parsear la estructura actual del formulario
      form_structure = JSON.parse(update_params[:form_structure])

      # Actualizar campos de deficiency con los valores de los parámetros
      form_structure.each do |field|
        next unless field['type'] == 'Deficiency'

        field_name = field['name']

        # Actualizar los subcampos desde los parámetros
        field['value'] = update_params["#{field_name}_select"] if update_params["#{field_name}_select"].present?

        if update_params.key?("#{field_name}_comment")
          field['comment_value'] = update_params["#{field_name}_comment"] || ''
        end

        field['Item'] = update_params["#{field_name}_item"] || '' if update_params.key?("#{field_name}_item")

        field['Riser'] = update_params["#{field_name}_riser"] || '' if update_params.key?("#{field_name}_riser")

        if update_params.key?("#{field_name}_c")
          field['C'] = update_params["#{field_name}_c"] == '1' ? 'Yes' : ''
        end

        if update_params.key?("#{field_name}_d")
          field['D'] = update_params["#{field_name}_d"] == '1' ? 'Yes' : ''
        end
      end

      # Actualizar la estructura en los parámetros
      update_params[:form_structure] = form_structure.to_json

      # Remover los parámetros de deficiency individuales ya que están en form_structure
      deficiency_keys = update_params.keys.select do |key|
        key.to_s.include?('_select') || key.to_s.include?('_comment') || key.to_s.include?('_item') || key.to_s.include?('_riser') || key.to_s.include?('_c') || key.to_s.include?('_d')
      end
      deficiency_keys.each { |key| update_params.delete(key) }
    rescue JSON::ParserError => e
      Rails.logger.error "Error processing deficiency fields: #{e.message}"
    end
  end
end
