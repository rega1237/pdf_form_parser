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

  private

  def form_fill_params
    params.require(:form_fill).permit(:name, :form_template_id, :form_structure)
  end
end
