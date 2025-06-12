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

  # Use callbacks to share common setup or constraints between actions.
  def set_form_fill
    @form_fill = FormFill.find(params[:id])
  end

  # Only allow a list of trusted parameters through.
  def form_fill_params
    params.require(:form_fill).permit(:name, :form_template_id, :form_structure, :inspection_id)
  end
end
