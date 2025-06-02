class FormFillsController < ApplicationController
  def index
    @form_fills = FormFill.all
  end

  def new
    @form_fill = FormFill.new
    @form_templates = FormTemplate.all
    return unless params[:form_template_id]

    @form_fill.form_template_id = params[:form_template_id]
    selected_template = FormTemplate.find_by(id: params[:form_template_id])
    @form_fill.form_structure = selected_template.form_structure if selected_template
  end

  def create
    @form_fill = FormFill.new(form_fill_params)
    if @form_fill.save
      redirect_to form_fill_path(@form_fill), notice: 'Form fill was successfully created.'
    else
      @form_templates = FormTemplate.all
      render :new, status: :unprocessable_entity
    end
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

  def destroy
    @form_fill = FormFill.find(params[:id])
    @form_fill.destroy
    redirect_to form_fills_url, notice: 'Form fill was successfully destroyed.'
  end

  def update
    @form_fill = FormFill.find(params[:id])
    if @form_fill.update(form_fill_params)
      # Respond with success, perhaps a JSON response or redirect
      # For now, let's redirect back to the show page or respond with JSON
      respond_to do |format|
        format.html { redirect_to form_fill_path(@form_fill), notice: 'Form fill was successfully updated.' }
        format.json { render json: { status: 'ok', message: 'Form fill saved successfully.' }, status: :ok }
      end
    else
      # Respond with error, perhaps a JSON response or render the show page with errors
      respond_to do |format|
        format.html { render :show, status: :unprocessable_entity }
        format.json { render json: @form_fill.errors, status: :unprocessable_entity }
      end
    end
  end

  def submit_form
    @form_fill = FormFill.find(params[:id])
    @form_template = @form_fill.form_template

    # Verificar que tenemos el ID del archivo en Google Drive
    unless @form_template.google_drive_file_id.present?
      flash[:error] = 'No se encontró el archivo PDF en Google Drive.'
      redirect_to form_fill_path(@form_fill) and return
    end

    begin
      # Inicializar el servicio de Google Drive
      drive_service = GoogleDriveService.new

      # Crear directorio temporal para trabajar con los archivos
      temp_dir = Rails.root.join('tmp', 'pdf_forms')
      FileUtils.mkdir_p(temp_dir) unless File.directory?(temp_dir)

      # Descargar el PDF desde Google Drive
      template_pdf_path = File.join(temp_dir, "template_#{@form_template.id}.pdf")
      drive_service.download_file(@form_template.google_drive_file_id, template_pdf_path)

      # Parsear los datos del formulario
      form_fields = JSON.parse(@form_fill.form_structure)

      # Llenar el PDF con los datos del formulario
      pdf_service = PdfFormsParserService.new(template_pdf_path)
      filled_pdf_filename = "#{@form_fill.name.parameterize}.pdf"
      filled_pdf_path = File.join(temp_dir, filled_pdf_filename)
      pdf_service.fill_form(filled_pdf_path, form_fields)

      # Crear o encontrar la carpeta 'forms/submitted' en Google Drive
      forms_folder_id = drive_service.find_or_create_folder('forms')
      submitted_folder_id = drive_service.find_or_create_folder('submitted', forms_folder_id)

      # Subir el PDF llenado a Google Drive
      file = drive_service.upload_file(
        filled_pdf_path,
        filled_pdf_filename,
        'application/pdf',
        submitted_folder_id
      )

      # Guardar el ID del archivo en Google Drive
      @form_fill.update(google_drive_file_id: file)

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

  def form_fill_params
    params.require(:form_fill).permit(:name, :form_template_id, :form_structure, :google_drive_file_id)
  end
end
