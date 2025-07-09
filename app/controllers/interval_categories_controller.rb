class IntervalCategoriesController < ApplicationController
  before_action :set_interval_category, only: %i[show edit update destroy]

  # GET /interval_categories or /interval_categories.json
  def index
    @interval_categories = IntervalCategory.all
  end

  # GET /interval_categories/1 or /interval_categories/1.json
  def show
  end

  # GET /interval_categories/new
  def new
    @interval_category = IntervalCategory.new
  end

  # GET /interval_categories/1/edit
  def edit
  end

  # POST /interval_categories or /interval_categories.json
  def create
    @interval_category = IntervalCategory.new(interval_category_params)

    respond_to do |format|
      if @interval_category.save
        format.html do
          redirect_to settings_path, notice: 'Interval category was successfully created.'
        end
        format.json { render :show, status: :created, location: @interval_category }
      else
        format.html { render :new, status: :unprocessable_entity }
        format.json { render json: @interval_category.errors, status: :unprocessable_entity }
      end
    end
  end

  # PATCH/PUT /interval_categories/1 or /interval_categories/1.json
  def update
    respond_to do |format|
      if @interval_category.update(interval_category_params)
        format.html do
          redirect_to settings_path, notice: 'Interval category was successfully updated.'
        end
        format.json { render :show, status: :ok, location: @interval_category }
      else
        format.html { render :edit, status: :unprocessable_entity }
        format.json { render json: @interval_category.errors, status: :unprocessable_entity }
      end
    end
  end

  # DELETE /interval_categories/1 or /interval_categories/1.json
  def destroy
    @interval_category.destroy

    respond_to do |format|
      format.html { redirect_to settings_path, notice: 'Interval category was successfully deleted.' }
      format.json { head :no_content }
    end
  end

  private

  # Use callbacks to share common setup or constraints between actions.
  def set_interval_category
    @interval_category = IntervalCategory.find(params[:id])
  end

  # Only allow a list of trusted parameters through.
  def interval_category_params
    params.require(:interval_category).permit(:name)
  end
end
