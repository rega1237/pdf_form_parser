class ContractorInfosController < ApplicationController
  before_action :set_contractor_info, only: [ :edit, :update, :destroy ]

  def new
    @contractor_info = ContractorInfo.new
    authorize @contractor_info
  end

  def create
    @contractor_info = ContractorInfo.new(contractor_info_params)
    authorize @contractor_info
    if @contractor_info.save
      redirect_to settings_path, notice: "Contractor info was successfully created."
    else
      render :new, status: :unprocessable_entity
    end
  end

  def edit
    authorize @contractor_info
  end

  def update
    authorize @contractor_info
    if @contractor_info.update(contractor_info_params)
      redirect_to settings_path, notice: "Contractor info was successfully updated."
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    authorize @contractor_info
    @contractor_info.destroy
    redirect_to settings_path, notice: "Contractor info was successfully destroyed."
  end

  private

  def set_contractor_info
    @contractor_info = ContractorInfo.find(params[:id])
  end

  def contractor_info_params
    params.require(:contractor_info).permit(:name, :address, :city, :state, :zip, :phone, :job, :misc)
  end
end
