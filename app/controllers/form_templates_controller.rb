require_dependency Rails.root.join('app/services/pdf_forms_parser_service.rb').to_s

class FormTemplatesController < ApplicationController
  before_action :set_form_template, only: %i[show update destroy form_builder]

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
    google_drive_file_id = nil

    if uploaded_file
      # Upload to Google Drive
      google_drive_service = GoogleDriveService.new
      file_metadata = google_drive_service.upload_file(uploaded_file.tempfile.path, uploaded_file.original_filename,
                                                       uploaded_file.content_type)
      google_drive_file_id = file_metadata.id if file_metadata

      if google_drive_file_id
        # Download the file temporarily for parsing
        temp_file = Tempfile.new([uploaded_file.original_filename.parameterize.truncate(50, omission: ''), '.pdf'],
                                 Rails.root.join('tmp'))
        temp_file_path = temp_file.path
        google_drive_service.download_file(google_drive_file_id, temp_file_path)

        determined_file_type = uploaded_file.content_type

        if determined_file_type == 'application/pdf'
          parser = PdfFormsParserService.new(temp_file_path)
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

        # Clean up the temporary file
        temp_file.close
        temp_file.unlink

        @form_template = FormTemplate.new(
          id: form_template_params[:id],
          name: form_template_params[:name],
          form_structure: form_structure.to_json,
          file_type: determined_file_type,
          google_drive_file_id: google_drive_file_id
        )
      else
        flash[:alert] = 'Failed to upload file to Google Drive.'
        render :new, status: :unprocessable_entity
        return
      end
    else
      @form_template = FormTemplate.new(form_template_params.except(:original_file))
      flash[:alert] = 'File upload is required.'
      render :new, status: :unprocessable_entity
      return
    end

    if @form_template.save
      redirect_to @form_template, notice: 'Form template was successfully created.'
    else
      # If save fails, attempt to delete the uploaded file from Google Drive
      google_drive_service.delete_file(google_drive_file_id) if google_drive_file_id
      render :new, status: :unprocessable_entity
    end
  end

  def show
    @form_template = FormTemplate.find(params[:id])
  end

  # GET /form_templates/:id/form_builder
  def form_builder
    # @form_template is already set by before_action
    # Logic for form builder will go here
    # For now, it will just render the form_builder.html.erb view
  end

  # PATCH/PUT /form_templates/1
  def update
    if form_template_params[:form_structure_order]
      new_order = JSON.parse(form_template_params[:form_structure_order])
      current_fields = JSON.parse(@form_template.form_structure)

      # Create a hash for quick lookup of fields by id
      fields_hash = current_fields.index_by { |field| field['name'] }

      # Reorder fields based on new_order, preserving existing field data and updating with new attributes
      # new_order is an array of hashes like [{"id":"FieldName1","position":0,"label_name":"Custom Label","section_name":"Section A","page_number":"1"}]
      # fields_hash is a hash of current fields indexed by their 'name'
      ordered_fields = new_order.map do |order_item|
        field = fields_hash[order_item['id']]
        if field
          # Update field attributes from the order_item
          field['label_name'] = order_item['label_name'] if order_item.key?('label_name')
          field['section_name'] = order_item['section_name'] if order_item.key?('section_name')
          field['page_number'] = order_item['page_number'] if order_item.key?('page_number')
          field['column_width'] = order_item['column_width'] if order_item.key?('column_width')
          field['required'] = order_item['required'] if order_item.key?('required')
        end
        field # Return the (potentially updated) field
      end.compact

      # Check if all original fields are present in the new order, if not, append them
      # This handles cases where new_order might not include all fields (e.g., if JS fails)
      current_field_names = current_fields.map { |f| f['name'] }
      ordered_field_names_from_new_order = new_order.map { |item| item['id'] }
      missing_field_names = current_field_names - ordered_field_names_from_new_order
      missing_field_names.each do |name_val|
        ordered_fields << fields_hash[name_val] if fields_hash[name_val]
      end

      if @form_template.update(form_structure: ordered_fields.to_json)
        redirect_to form_builder_form_template_path(@form_template), notice: 'Form structure updated successfully.'
      else
        render :form_builder, status: :unprocessable_entity
      end
    elsif @form_template.update(form_template_params.except(:form_structure_order))
      redirect_to @form_template, notice: 'Form template was successfully updated.'
    else
      render :edit, status: :unprocessable_entity # Assuming you might have an edit view
    end
  end

  # DELETE /form_templates/1
  def destroy
    # The before_destroy callback in the FormTemplate model handles Google Drive file deletion.
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
    params.require(:form_template).permit(:id, :name, :description, :original_file, :form_structure,
                                          :form_structure_order, :label_name, :section_name, :page_number, :column_width, :required, :google_drive_file_id)
  end
end
