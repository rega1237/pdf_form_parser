require_dependency Rails.root.join('app/services/pdf_forms_parser_service.rb').to_s

class FormTemplatesController < ApplicationController
  before_action :set_form_template, only: %i[show destroy fill submit_filled_form form_builder]

  # GET /form_templates
  def index
    @form_templates = FormTemplate.all
  end

  def new
    @form_template = FormTemplate.new
  end

  def create
    uploaded_file = form_template_params[:original_file]
    form_structure = {}

    if uploaded_file
      save_path_dir = Rails.root.join('app', 'assets', 'forms')
      FileUtils.mkdir_p(save_path_dir) unless Dir.exist?(save_path_dir)
      # Use original_filename from the uploaded file for the actual disk filename
      disk_file_name = uploaded_file.original_filename
      saved_file_on_disk_path = save_path_dir.join(disk_file_name)

      File.open(saved_file_on_disk_path, 'wb') do |file|
        file.write(uploaded_file.read)
      end

      # Determine file type for parsing (you already have t.string :file_type in migration)
      # You might want to store uploaded_file.content_type in the file_type column
      determined_file_type = uploaded_file.content_type

      if determined_file_type == 'application/pdf'
        parser = PdfFormsParserService.new(saved_file_on_disk_path.to_s)
        form_structure = parser.parse
      elsif ['application/vnd.openxmlformats-officedocument.wordprocessingml.document',
             'application/msword'].include?(determined_file_type)
        Rails.logger.info 'DOCX/DOC parsing not yet implemented.'
      elsif ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
             'application/vnd.ms-excel'].include?(determined_file_type)
        Rails.logger.info 'XLS/XLSX parsing not yet implemented.'
      else
        Rails.logger.warn "Unsupported file type: #{determined_file_type}"
      end

      @form_template = FormTemplate.new(
        name: form_template_params[:name],
        form_structure: form_structure.to_json,
        original_filename: disk_file_name, # from your migration
        file_path: saved_file_on_disk_path.to_s.sub(Rails.root.to_s, ''), # Use existing file_path
        file_type: determined_file_type # from your migration
      )
    else
      @form_template = FormTemplate.new(form_template_params.except(:original_file))
      flash[:alert] = 'File upload is required.'
      render :new, status: :unprocessable_entity
      return
    end

    if @form_template.save
      redirect_to @form_template, notice: 'Form template was successfully created.'
    else
      File.delete(saved_file_on_disk_path) if uploaded_file && File.exist?(saved_file_on_disk_path)
      render :new, status: :unprocessable_entity
    end
  end

  def show
    @form_template = FormTemplate.find(params[:id])
  end

  # GET /form_templates/:id/fill
  def fill
    # @form_template is already set by before_action
    if @form_template.form_structure.blank?
      redirect_to @form_template, alert: 'Form structure is not available for this template.'
      return
    end
    begin
      @form_fields = JSON.parse(@form_template.form_structure)
    rescue JSON::ParserError => e
      Rails.logger.error "Failed to parse form_structure for FormTemplate ID #{@form_template.id}: #{e.message}"
      redirect_to @form_template, alert: 'There was an error parsing the form structure.'
      nil
    end
    # The view fill.html.erb will use @form_template and @form_fields
  end

  # POST /form_templates/:id/submit_filled_form
  def submit_filled_form
    # This is where we'll handle the submitted form data
    # For now, let's just print the params and redirect
    Rails.logger.info "Submitted form data: #{params[:form_data].inspect}"

    # We will implement PDF filling and response later
    # For now, redirect back to the form template's show page with a notice
    redirect_to @form_template, notice: 'Form submitted (PDF filling not yet implemented).'
  end

  # GET /form_templates/:id/form_builder
  def form_builder
    # @form_template is already set by before_action
    # Logic for form builder will go here
    # For now, it will just render the form_builder.html.erb view
  end

  # DELETE /form_templates/1
  def destroy
    # @form_template is set by before_action
    # Optionally, delete the physical file when the record is destroyed
    File.delete(@form_template.file_path) if File.exist?(@form_template.file_path)
    @form_template.destroy
    redirect_to form_templates_path, notice: 'Form template deleted successfully.', status: :see_other
  end

  private

  # Use callbacks to share common setup or constraints between actions.
  def set_form_template
    @form_template = FormTemplate.find(params[:id])
  end

  # Only allow a list of trusted parameters through.
  def form_template_params
    params.require(:form_template).permit(:name, :description, :original_file)
  end
end
