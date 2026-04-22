require_dependency Rails.root.join("app/services/pdf_forms_parser_service.rb").to_s

class FormTemplatesController < ApplicationController
  before_action :set_form_template, only: %i[show update destroy form_builder edit form_builder_update]
  before_action :set_interval_categories, only: %i[new edit create update]
  before_action :set_system_categories, only: %i[new edit create update]

  # GET /form_templates
  def index
    @form_templates = policy_scope(FormTemplate).order(name: :asc)
  end

  def show
    authorize @form_template
    @form_template = FormTemplate.find(params[:id])
  end

  # GET /form_templates/:id/form_builder
  def form_builder
    authorize @form_template
    set_interval_categories
    set_system_categories
  end

  def new
    authorize FormTemplate
    @form_template = FormTemplate.new
  end

  def create
    authorize FormTemplate
    uploaded_file = form_template_params[:original_file]

    # 1. Validar que se haya subido un archivo
    unless uploaded_file
      @form_template = FormTemplate.new(form_template_params.except(:original_file))
      flash[:alert] = "File upload is required."
      # Asegúrate de cargar las categorías para que el formulario de 'new' se renderice correctamente
      set_interval_categories
      set_system_categories
      render :new, status: :unprocessable_entity
      return
    end

    # 2. Crear el registro del FormTemplate sin la estructura del formulario
    @form_template = FormTemplate.new(
      id: form_template_params[:id],
      name: form_template_params[:name],
      original_filename: uploaded_file.original_filename,
      file_type: uploaded_file.content_type,
      system_category: form_template_params[:system_category]
    )

    # Asignar las categorías de intervalo (si se seleccionaron)
    if params[:form_template][:interval_category_ids].present?
      @form_template.interval_category_ids = params[:form_template][:interval_category_ids]
    end

    # Adjuntar el archivo usando Active Storage
    @form_template.original_file.attach(uploaded_file)

    # 3. Guardar el registro y encolar el trabajo en segundo plano
    if @form_template.save
      # Encolar el job para que parseé el PDF en segundo plano
      ParseFormTemplateJob.perform_later(@form_template.id)

      # Redirigir inmediatamente al usuario con un mensaje informativo
      redirect_to @form_template,
                  notice: "Form template created successfully. The file is being processed and the structure will appear shortly."
    else
      # Si falla el guardado, volver a renderizar el formulario con los errores
      set_interval_categories
      set_system_categories
      render :new, status: :unprocessable_entity
    end
  end

  def edit
    authorize @form_template
  end

  # PATCH/PUT /form_templates/1
  def update
    authorize @form_template
    uploaded_file = form_template_params[:original_file]
    form_structure = {}

    if uploaded_file.present?
      # Si hay un nuevo archivo, procesarlo
      # Actualizar los metadatos del archivo
      @form_template.original_filename = uploaded_file.original_filename
      @form_template.file_type = uploaded_file.content_type

      # Adjuntar el nuevo archivo (esto reemplazará el anterior automáticamente)
      @form_template.original_file.attach(uploaded_file)

      if @form_template.original_file.attached?
        # Descargar el archivo temporalmente para analizarlo
        temp_file = Tempfile.new([ uploaded_file.original_filename.parameterize.truncate(50, omission: ""), ".pdf" ],
                                 Rails.root.join("tmp"))
        temp_file_path = temp_file.path

        # Guardar el archivo temporalmente
        # Reiniciar el puntero del archivo antes de leer
        uploaded_file.rewind
        File.binwrite(temp_file_path, uploaded_file.read)

        determined_file_type = uploaded_file.content_type

        if determined_file_type == "application/pdf"
          parser = PdfFormsParserService.new(temp_file_path)
          form_structure = parser.parse
        elsif [ "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
               "application/msword" ].include?(determined_file_type)
          Rails.logger.info "DOCX/DOC parsing not yet implemented."
        elsif [ "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
               "application/vnd.ms-excel" ].include?(determined_file_type)
          Rails.logger.info "XLS/XLSX parsing not yet implemented."
        else
          Rails.logger.warn "Unsupported file type: #{determined_file_type}"
        end

        # Limpiar el archivo temporal
        temp_file.close
        temp_file.unlink

        # Actualizar la estructura del formulario solo si se parseó correctamente
        @form_template.form_structure = form_structure.to_json if form_structure.present?
      else
        flash[:alert] = "Failed to attach file."
        render :edit, status: :unprocessable_entity
        return
      end
    end

    # Actualizar otros parámetros (siempre, independientemente de si hay archivo o no)
    update_params = form_template_params.except(:original_file)

    # Asignar las categorías de intervalo si están presentes
    if params[:form_template][:interval_category_ids].present?
      @form_template.interval_category_ids = params[:form_template][:interval_category_ids]
    end

    # Actualizar los atributos del modelo
    @form_template.assign_attributes(update_params)

    if @form_template.save
      redirect_to @form_template, notice: "Form template was successfully updated."
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def form_builder_update
    if form_template_params[:form_structure_order]
      begin
        # Parsear los datos del frontend directamente
        new_order = JSON.parse(form_template_params[:form_structure_order])

        # Validación básica: que sea un array válido
        if new_order.is_a?(Array)
          # Actualizar la estructura del formulario directamente
          if @form_template.update(form_structure: new_order.to_json)
            Rails.logger.info "Form structure updated successfully"
            redirect_to form_builder_form_template_path(@form_template),
                        notice: "Form structure updated successfully."
          else
            Rails.logger.error "Failed to update form template: #{@form_template.errors.full_messages}"
            flash[:alert] = "Failed to update form structure."
            render :form_builder, status: :unprocessable_entity
          end
        else
          Rails.logger.error "Invalid form structure format: #{new_order.class}"
          flash[:alert] = "Invalid form structure format."
          render :form_builder, status: :unprocessable_entity
        end
      rescue JSON::ParserError => e
        Rails.logger.error "JSON parsing error in form_builder_update: #{e.message}"
        flash[:alert] = "Invalid JSON format received. Please try again."
        render :form_builder, status: :unprocessable_entity
      rescue StandardError => e
        Rails.logger.error "Error in form_builder_update: #{e.message}"
        Rails.logger.error e.backtrace.join("\n")
        flash[:alert] = "An error occurred while updating the form structure."
        render :form_builder, status: :unprocessable_entity
      end
    else
      Rails.logger.error "No form_structure_order received in params"
      flash[:alert] = "No form structure data received."
      render :form_builder, status: :unprocessable_entity
    end
  end

  # DELETE /form_templates/1
  def destroy
    authorize @form_template
    # Active Storage se encargará de eliminar los archivos adjuntos
    if @form_template.destroy
      redirect_to form_templates_path, notice: "Form template deleted successfully.", status: :see_other
    else
      redirect_to form_templates_path, alert: "Cannot delete form template: #{@form_template.errors.full_messages.join(', ')}", status: :see_other
    end
  end

  private

  # Use callbacks to share common setup or constraints between actions.
  def set_form_template
    @form_template = FormTemplate.find(params[:id])
  end

  def set_interval_categories
    @interval_categories = IntervalCategory.all
  end

  def set_system_categories
    @system_categories = SystemCategory.order(name: :asc)
  end

  # Only allow a list of trusted parameters through.
  def form_template_params
    params.require(:form_template).permit(:id, :name, :description, :original_file, :form_structure,
                                          :form_structure_order, :label_name, :section_name, :page_number, :column_width, :required,
                                          :system_category, interval_category_ids: [])
  end
end
