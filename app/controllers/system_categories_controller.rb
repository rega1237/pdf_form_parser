class SystemCategoriesController < ApplicationController
  before_action :set_system_category, only: %i[show edit update destroy]

  # GET /system_categories or /system_categories.json
  def index
    @system_categories = SystemCategory.all
    authorize @system_categories
  end

  # GET /system_categories/1 or /system_categories/1.json
  def show
    authorize @system_category
  end

  # GET /system_categories/new
  def new
    @system_category = SystemCategory.new
    authorize @system_category
  end

  # GET /system_categories/1/edit
  def edit
    authorize @system_category
  end

  # POST /system_categories or /system_categories.json
  def create
    @system_category = SystemCategory.new(system_category_params)
    authorize @system_category

    respond_to do |format|
      if @system_category.save
        format.html { redirect_to settings_path, notice: "System category was successfully created." }
        format.json { render :show, status: :created, location: @system_category }
      else
        format.html { render :new, status: :unprocessable_entity }
        format.json { render json: @system_category.errors, status: :unprocessable_entity }
      end
    end
  end

  # PATCH/PUT /system_categories/1 or /system_categories/1.json
  def update
    authorize @system_category
    respond_to do |format|
      if @system_category.update(system_category_params)
        format.html { redirect_to settings_path, notice: "System category was successfully updated." }
        format.json { render :show, status: :ok, location: @system_category }
      else
        format.html { render :edit, status: :unprocessable_entity }
        format.json { render json: @system_category.errors, status: :unprocessable_entity }
      end
    end
  end

  # DELETE /system_categories/1 or /system_categories/1.json
  def destroy
    authorize @system_category
    @system_category.destroy!

    respond_to do |format|
      format.html do
        redirect_to settings_path, status: :see_other, notice: "System category was successfully destroyed."
      end
      format.json { head :no_content }
    end
  end

  private

  # Use callbacks to share common setup or constraints between actions.
  def set_system_category
    @system_category = SystemCategory.find(params.expect(:id))
  end

  # Only allow a list of trusted parameters through.
  def system_category_params
    params.require(:system_category).permit(:name, :thumbnail)
  end
end
