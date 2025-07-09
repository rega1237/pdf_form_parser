class DeficienciesController < ApplicationController
  before_action :set_deficiency, only: %i[ show edit update destroy ]

  # GET /deficiencies or /deficiencies.json
  def index
    @deficiencies = Deficiency.all
  end

  # GET /deficiencies/1 or /deficiencies/1.json
  def show
  end

  # GET /deficiencies/new
  def new
    @deficiency = Deficiency.new
  end

  # GET /deficiencies/1/edit
  def edit
  end

  # POST /deficiencies or /deficiencies.json
  def create
    @deficiency = Deficiency.new(deficiency_params)

    respond_to do |format|
      if @deficiency.save
        format.html { redirect_to settings_path, notice: "Deficiency was successfully created." }
        format.json { render :show, status: :created, location: @deficiency }
      else
        format.html { render :new, status: :unprocessable_entity }
        format.json { render json: @deficiency.errors, status: :unprocessable_entity }
      end
    end
  end

  # PATCH/PUT /deficiencies/1 or /deficiencies/1.json
  def update
    respond_to do |format|
      if @deficiency.update(deficiency_params)
        format.html { redirect_to settings_path, notice: "Deficiency was successfully updated." }
        format.json { render :show, status: :ok, location: @deficiency }
      else
        format.html { render :edit, status: :unprocessable_entity }
        format.json { render json: @deficiency.errors, status: :unprocessable_entity }
      end
    end
  end

  # DELETE /deficiencies/1 or /deficiencies/1.json
  def destroy
    @deficiency.destroy!

    respond_to do |format|
      format.html { redirect_to settings_path, status: :see_other, notice: "Deficiency was successfully destroyed." }
      format.json { head :no_content }
    end
  end

  private
    # Use callbacks to share common setup or constraints between actions.
    def set_deficiency
      @deficiency = Deficiency.find(params.expect(:id))
    end

    # Only allow a list of trusted parameters through.
    def deficiency_params
      params.expect(deficiency: [ :name ])
    end
end
