class FormFillsController < ApplicationController
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
    # We'll need to decide where to redirect after successful creation.
    # For now, let's assume it redirects to the show page of the form template.
    # Or perhaps a list of form fills, or the form fill's own show page if we create one.
    if @form_fill.save
      redirect_to form_fill_path(@form_fill), notice: 'Form fill was successfully created.'
    else
      @form_templates = FormTemplate.all # Reload for the form
      render :new, status: :unprocessable_entity
    end
  end

  def show
    @form_fill = FormFill.find(params[:id])
    if @form_fill.form_structure.present?
      begin
        @form_fields = JSON.parse(@form_fill.form_structure)
      rescue JSON::ParserError => e
        # Handle JSON parsing error, e.g., log it or set @form_fields to an empty array
        Rails.logger.error "Failed to parse form_structure for FormFill ##{@form_fill.id}: #{e.message}"
        @form_fields = [] # Or provide a flash message to the user
      end
    else
      @form_fields = []
    end
  end

  private

  def form_fill_params
    # Ensure you permit all the attributes you want to save for FormFill
    # For now, just :name and :form_template_id
    params.require(:form_fill).permit(:name, :form_template_id, :form_structure)
  end
end
