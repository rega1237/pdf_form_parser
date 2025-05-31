class FormFillsController < ApplicationController
  def new
    @form_fill = FormFill.new
    @form_fill.form_template_id = params[:form_template_id] if params[:form_template_id]
    @form_templates = FormTemplate.all
  end

  def create
    @form_fill = FormFill.new(form_fill_params)
    # We'll need to decide where to redirect after successful creation.
    # For now, let's assume it redirects to the show page of the form template.
    # Or perhaps a list of form fills, or the form fill's own show page if we create one.
    if @form_fill.save
      # Placeholder redirect, adjust as needed
      redirect_to form_template_path(@form_fill.form_template), notice: 'Form fill was successfully created.'
    else
      @form_templates = FormTemplate.all # Reload for the form
      render :new, status: :unprocessable_entity
    end
  end

  private

  def form_fill_params
    # Ensure you permit all the attributes you want to save for FormFill
    # For now, just :name and :form_template_id
    params.require(:form_fill).permit(:name, :form_template_id)
  end
end
