class FormFillsController < ApplicationController
  def index
    @form_fills = FormFill.all
  end

  def show
    @form_fill = FormFill.find(params[:id])
    @deficiencies = Deficiency.order(:name).all
    @system_categories = SystemCategory.all
    @interval_categories = IntervalCategory.all
    @form_template = @form_fill.form_template

    if @form_fill.form_structure.present?
      begin
        form_fields = JSON.parse(@form_fill.form_structure)
        data = @form_fill.data || {} # Asegura que `data` sea un hash

        # Itera sobre los campos y fusiona los datos guardados
        form_fields.each do |field|
          next unless field['name'].present?

          field_name = field['name']

          if field['type'] == 'Deficiency'
            # Para los campos Deficiency, carga cada sub-campo desde la columna `data`
            field['value'] = data["#{field_name}_select"] || field['value'] || ''
            field['select'] = data["#{field_name}_select"] || field['select'] || '' # Agregamos 'select' por consistencia
            field['comment_value'] = data["#{field_name}_comment"] || field['comment_value'] || ''
            field['Item'] = data["#{field_name}_item"] || field['Item'] || ''
            field['Riser'] = data["#{field_name}_riser"] || field['Riser'] || ''
            field['C'] = data["#{field_name}_c"] || field['C'] || ''
            field['D'] = data["#{field_name}_d"] || field['D'] || ''
          else
            # Para otros tipos de campo, carga el valor desde `data`
            field['value'] = data[field_name] || field['value'] || ''
          end
        end
        @form_fields = form_fields
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

    # Separate photo parameters from other parameters
    update_params = form_fill_params.except(*photo_field_names)
    photo_params = form_fill_params.slice(*photo_field_names)

    # Separate structure updates from data updates
    structure_params = update_params.slice(:form_structure, :name, :form_template_id, :inspection_id)
    data_params = update_params.except(:form_structure, :name, :form_template_id, :inspection_id)

    # Process deficiency fields and extract data values
    deficiency_data = process_deficiency_fields_for_data(data_params)

    # Process category fields and extract data values
    category_data = process_category_fields_for_data(data_params)

    # Combine all data updates
    all_data_updates = data_params.merge(deficiency_data).merge(category_data)

    begin
      # Update structure-related fields first (if any)
      structure_updated = structure_params.empty? || @form_fill.update(structure_params)

      # Update data column with field values
      data_updated = all_data_updates.empty? || @form_fill.bulk_update_data(all_data_updates)

      if structure_updated && data_updated
        # Process photos if any
        photo_results = process_photo_uploads(photo_params)

        if photo_results[:errors].any?
          render json: {
            success: false,
            message: "Form saved but with photo errors: #{photo_results[:errors].join(', ')}"
          }, status: :unprocessable_entity
        else
          success_message = 'Draft saved successfully.'
          success_message += " #{photo_results[:uploaded]} photo(s) uploaded." if photo_results[:uploaded].positive?
          if photo_results[:skipped].positive?
            success_message += " #{photo_results[:skipped]} photo(s) skipped (already saved)."
          end

          render json: { success: true, message: success_message }, status: :ok
        end
      else
        render json: {
          success: false,
          errors: @form_fill.errors.full_messages,
          message: 'Could not save draft.'
        }, status: :unprocessable_entity
      end
    rescue StandardError => e
      Rails.logger.error "Error updating FormFill ##{@form_fill.id}: #{e.message}"
      render json: {
        success: false,
        error: "Error updating form: #{e.message}",
        message: 'Could not save draft.'
      }, status: :internal_server_error
    end
  end

  # Endpoint to remove specific photo (updated for data column)
  def remove_photo
    @form_fill = FormFill.find(params[:id])

    # Get parameters from JSON request
    request_data = begin
      JSON.parse(request.body.read)
    rescue StandardError
      {}
    end
    field_name = request_data['field_name'] || params[:field_name]

    if field_name.blank?
      render json: {
        success: false,
        error: 'Field name is required'
      }, status: :bad_request
      return
    end

    begin
      # Use the model method that already works with data column
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
    rescue StandardError => e
      Rails.logger.error "Error removing photo for field #{field_name}: #{e.message}"
      render json: {
        success: false,
        error: "Error removing photo: #{e.message}",
        field_name: field_name
      }, status: :internal_server_error
    end
  end

  # Endpoint para obtener estructura actualizada del formulario
  def structure
    @form_fill = FormFill.find(params[:id])

    if @form_fill.form_structure.present?
      begin
        form_fields = JSON.parse(@form_fill.form_structure)
        data = @form_fill.data || {} # Obtenemos los datos guardados, asegurando que no sea nulo

        form_fields.each do |field|
          next unless field['name'].present?

          field_name = field['name']

          # Usamos un `case` para manejar cada tipo de campo de forma clara y correcta
          case field['type']
          when 'Photo'
            # --- LÓGICA AGREGADA PARA FOTOS ---
            # Se lee la clave estandarizada `_photo_attachment_id` desde la columna `data`.
            # Si la foto fue borrada, el valor será `nil`, y eso es lo que se enviará al frontend.
            field['photo_attachment_id'] = data["#{field_name}_photo_attachment_id"]

          when 'Deficiency'
            # La lógica para los campos de deficiencia se mantiene, ya que es correcta.
            field['value'] = data["#{field_name}_select"] || ''
            field['select'] = data["#{field_name}_select"] || ''
            field['comment_value'] = data["#{field_name}_comment"] || ''
            field['Item'] = data["#{field_name}_item"] || ''
            field['Riser'] = data["#{field_name}_riser"] || ''
            field['C'] = data["#{field_name}_c"] || ''
            field['D'] = data["#{field_name}_d"] || ''

          else
            # Lógica por defecto para todos los demás tipos de campo.
            field['value'] = data[field_name] || ''
          end
        end

        updated_structure = form_fields.to_json

        render json: {
          form_structure: updated_structure,
          form_fields: form_fields, # Se devuelven los campos ya fusionados con los datos.
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

  # Endpoint to get specific photo URL (updated for data column)
  def photo_url
    @form_fill = FormFill.find(params[:id])

    # Get parameters from JSON request
    request_data = begin
      JSON.parse(request.body.read)
    rescue StandardError
      {}
    end
    field_name = request_data['field_name'] || params[:field_name]

    if field_name.blank?
      render json: {
        success: false,
        error: 'Field name is required'
      }, status: :bad_request
      return
    end

    begin
      # Use the model method that already works with data column
      photo_url = @form_fill.get_photo_url_for_field(field_name)

      render json: {
        success: true,
        photo_url: photo_url,
        field_name: field_name,
        has_photo: photo_url.present?
      }
    rescue StandardError => e
      Rails.logger.error "Error getting photo URL for field #{field_name}: #{e.message}"
      render json: {
        success: false,
        error: "Error getting photo URL: #{e.message}",
        field_name: field_name
      }, status: :internal_server_error
    end
  end

  # AJAX endpoint for single field updates
  def update_field_data
    @form_fill = FormFill.find(params[:id])

    # Get field name and value from request
    field_name = params[:field_name]
    field_value = params[:field_value]

    if field_name.blank?
      render json: {
        success: false,
        error: 'Field name is required'
      }, status: :bad_request
      return
    end

    begin
      # Update single field in data column
      success = @form_fill.set_field_value(field_name, field_value)

      if success
        render json: {
          success: true,
          message: 'Field updated successfully',
          field_name: field_name,
          field_value: field_value
        }
      else
        render json: {
          success: false,
          error: 'Failed to update field',
          field_name: field_name
        }, status: :unprocessable_entity
      end
    rescue StandardError => e
      Rails.logger.error "Error updating field #{field_name}: #{e.message}"
      render json: {
        success: false,
        error: "Error updating field: #{e.message}",
        field_name: field_name
      }, status: :internal_server_error
    end
  end

  # AJAX endpoint for multiple field updates
  def bulk_update_data
    @form_fill = FormFill.find(params[:id])

    # Get field data from request
    field_data = params[:field_data]&.permit!&.to_h || {}

    if field_data.blank?
      render json: {
        success: false,
        error: 'Field data is required'
      }, status: :bad_request
      return
    end

    begin
      # Update multiple fields in data column
      success = @form_fill.bulk_update_data(field_data)

      if success
        render json: {
          success: true,
          message: 'Fields updated successfully',
          updated_fields: field_data.keys,
          field_count: field_data.size
        }
      else
        render json: {
          success: false,
          error: 'Failed to update fields'
        }, status: :unprocessable_entity
      end
    rescue StandardError => e
      Rails.logger.error "Error bulk updating fields: #{e.message}"
      render json: {
        success: false,
        error: "Error updating fields: #{e.message}"
      }, status: :internal_server_error
    end
  end

  # Endpoint to get merged form data for PDF generation
  def get_merged_form_data
    @form_fill = FormFill.find(params[:id])

    begin
      # Get merged structure with data for PDF generation
      merged_data = @form_fill.merge_structure_with_data

      render json: {
        success: true,
        form_data: merged_data,
        form_fill_id: @form_fill.id
      }
    rescue StandardError => e
      Rails.logger.error "Error getting merged form data for FormFill ##{@form_fill.id}: #{e.message}"
      render json: {
        success: false,
        error: "Error retrieving form data: #{e.message}"
      }, status: :internal_server_error
    end
  end

  # AJAX endpoint for photo uploads (updated for data column)
  def upload_photo
    @form_fill = FormFill.find(params[:id])
    field_name = params[:field_name]
    photo_file = params[:photo]

    if field_name.blank? || photo_file.blank?
      render json: {
        success: false,
        error: 'Field name and photo file are required'
      }, status: :bad_request
      return
    end

    begin
      # Use the model method that already works with data column
      result = @form_fill.attach_photo_for_field(field_name, photo_file)

      if result[:success]
        render json: {
          success: true,
          message: 'Photo uploaded successfully',
          attachment_id: result[:attachment_id],
          photo_url: @form_fill.get_photo_url_for_field(field_name),
          field_name: field_name
        }
      else
        render json: {
          success: false,
          error: result[:error],
          field_name: field_name
        }, status: :unprocessable_entity
      end
    rescue StandardError => e
      Rails.logger.error "Error uploading photo for field #{field_name}: #{e.message}"
      render json: {
        success: false,
        error: "Error uploading photo: #{e.message}",
        field_name: field_name
      }, status: :internal_server_error
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

    # Le pasamos el `form_structure` ya actualizado. para crear el next_inspection
    create_next_inspection_from_structure(@main_form_fill.form_structure)

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

    # Obtener campos de categoría dinámicamente
    category_params = category_field_params

    # Combinar todos los parámetros
    basic_params.merge(photo_params).merge(deficiency_params).merge(category_params)
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

  # Método para obtener parámetros de campos Category dinámicamente
  def category_field_params
    category_params = {}

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
      category_fields = structure.select { |field| ['System Category', 'Interval Category'].include?(field['type']) }

      category_fields.each do |field|
        field_name = field['name']
        # Permitir el campo de categoría
        category_params[field_name] = params.dig(:form_fill, field_name)
      end

      # Filtrar parámetros nulos
      category_params.compact
    rescue JSON::ParserError => e
      Rails.logger.error "Error parsing form structure for category params: #{e.message}"
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

  # method to process category fields for data column
  def process_category_fields_for_data(data_params)
    category_data = {}

    # Get form structure to identify category fields
    return category_data unless @form_fill.form_structure.present?

    begin
      structure = JSON.parse(@form_fill.form_structure)
      category_fields = structure.select { |field| ['System Category', 'Interval Category'].include?(field['type']) }

      category_fields.each do |field|
        field_name = field['name']

        # Check if this field has a value in the data params
        next unless data_params.key?(field_name) && data_params[field_name].present?

        category_data[field_name] = data_params[field_name]

        # For Interval Category, also store selected_categories
        if field['type'] == 'Interval Category'
          selected_categories = data_params[field_name].split(', ').map(&:strip)
          category_data["#{field_name}_selected_categories"] = selected_categories
        else
          # For System Category, store as single-item array
          category_data["#{field_name}_selected_categories"] = [data_params[field_name]]
        end
      end
    rescue JSON::ParserError => e
      Rails.logger.error "Error processing category fields for data: #{e.message}"
    end

    category_data
  end

  # Legacy method for backward compatibility (kept for existing functionality)
  def process_category_fields(update_params)
    return unless update_params[:form_structure].present?

    begin
      # Parsear la estructura actual del formulario
      form_structure = JSON.parse(update_params[:form_structure])

      # Actualizar campos de categoría con los valores de los parámetros
      form_structure.each do |field|
        next unless ['System Category', 'Interval Category'].include?(field['type'])

        field_name = field['name']

        # Actualizar el valor del campo de categoría
        next unless update_params[field_name].present?

        field['value'] = update_params[field_name]

        # Para campos de categoría múltiple, también actualizar selected_categories
        field['selected_categories'] = if field['type'] == 'Interval Category'
                                         # Si el valor contiene múltiples categorías separadas por coma
                                         update_params[field_name].split(', ').map(&:strip)
                                       else
                                         # Para System Category, es una sola categoría
                                         [update_params[field_name]]
                                       end
      end

      # Actualizar la estructura en los parámetros
      update_params[:form_structure] = form_structure.to_json

      # Remover los parámetros de categoría individuales ya que están en form_structure
      category_keys = update_params.keys.select do |key|
        form_structure.any? do |field|
          field['name'] == key.to_s && ['System Category', 'Interval Category'].include?(field['type'])
        end
      end
      category_keys.each { |key| update_params.delete(key) }
    rescue JSON::ParserError => e
      Rails.logger.error "Error processing category fields: #{e.message}"
    end
  end

  def photo_already_exists_for_field?(field_name, new_photo_file)
    return false unless @form_fill.form_structure.present?

    begin
      structure = JSON.parse(@form_fill.form_structure)
      field_data = structure.find { |field| field['name'] == field_name && field['type'] == 'Photo' }

      # Si el campo no tiene photo_attachment_id, no hay foto existente
      return false unless field_data&.dig('photo_attachment_id').present?

      # Obtener la foto existente
      existing_photo = @form_fill.get_photo_for_field(field_name)
      return false unless existing_photo.present?

      # Comparación básica por tamaño y tipo (más eficiente)
      same_size = existing_photo.byte_size == new_photo_file.size
      same_content_type = existing_photo.content_type == new_photo_file.content_type

      # Si son exactamente iguales en tamaño y tipo, probablemente es el mismo archivo
      is_same_file = same_size && same_content_type

      Rails.logger.info "Photo comparison for #{field_name}: size(#{same_size}), type(#{same_content_type}) = same_file(#{is_same_file})"

      is_same_file
    rescue JSON::ParserError => e
      Rails.logger.error "Error checking existing photo for field #{field_name}: #{e.message}"
      false
    rescue StandardError => e
      Rails.logger.error "Error comparing photos for field #{field_name}: #{e.message}"
      false
    end
  end

  # New method to process deficiency fields for data column
  def process_deficiency_fields_for_data(data_params)
    deficiency_data = {}

    # Extract deficiency field values for data column storage
    data_params.each do |key, value|
      key_str = key.to_s

      # Handle deficiency select values
      if key_str.end_with?('_select')
        field_name = key_str.gsub('_select', '')
        deficiency_data["#{field_name}_select"] = value if value.present?
        deficiency_data[field_name] = value if value.present?

      # Handle deficiency comments
      elsif key_str.end_with?('_comment')
        field_name = key_str.gsub('_comment', '')
        deficiency_data["#{field_name}_comment"] = value || ''

      # Handle deficiency items
      elsif key_str.end_with?('_item')
        field_name = key_str.gsub('_item', '')
        deficiency_data["#{field_name}_item"] = value || ''

      # Handle deficiency risers
      elsif key_str.end_with?('_riser')
        field_name = key_str.gsub('_riser', '')
        deficiency_data["#{field_name}_riser"] = value || ''

      # Handle deficiency C values
      elsif key_str.end_with?('_c')
        field_name = key_str.gsub('_c', '')
        deficiency_data["#{field_name}_c"] = value == '1' ? 'Yes' : ''

      # Handle deficiency D values
      elsif key_str.end_with?('_d')
        field_name = key_str.gsub('_d', '')
        deficiency_data["#{field_name}_d"] = value == '1' ? 'Yes' : ''
      end
    end

    deficiency_data
  end

  # Legacy method for backward compatibility (kept for existing functionality)
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

  def create_next_inspection_from_structure(form_structure_json)
    inspection = @main_form_fill.inspection
    return unless inspection && form_structure_json.present?

    begin
      structure = JSON.parse(form_structure_json)

      # Encontrar los valores seleccionados en el formulario
      system_category_field = structure.find { |field| field['type'] == 'System Category' }
      interval_category_field = structure.find { |field| field['type'] == 'Interval Category' }

      system_category_name = system_category_field['value'] if system_category_field

      # Maneja tanto 'value' como 'selected_categories' para el intervalo
      interval_category_name = if interval_category_field
                                 (interval_category_field['selected_categories'] || [interval_category_field['value']]).first
                               end

      # Proceder si tenemos toda la información
      if system_category_name.present? && interval_category_name.present?
        system_category = SystemCategory.find_by(name: system_category_name)
        interval_category = IntervalCategory.find_by(name: interval_category_name)

        if system_category && interval_category&.duration_in_months.present?
          next_date = inspection.date + interval_category.duration_in_months.months

          NextInspection.create!(
            property: inspection.property,
            system_category: system_category,
            interval_category: interval_category,
            next_inspection_date: next_date,
            status: 'scheduled'
          )
          Rails.logger.info "Next inspection scheduled for property #{inspection.property.id} on #{next_date}"
        else
          Rails.logger.warn('Could not find System/Interval category or duration_in_months is not set.')
        end
      end
    rescue JSON::ParserError => e
      Rails.logger.error "Failed to parse form_structure for next inspection: #{e.message}"
    end
  end
end
