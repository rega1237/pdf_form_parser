class LicenseInfosController < ApplicationController
  before_action :set_license_info, only: [:edit, :update, :destroy]

  def new
    @license_info = LicenseInfo.new
  end

  def create
    @license_info = LicenseInfo.new(license_info_params)
    if @license_info.save
      redirect_to settings_path, notice: 'License info was successfully created.'
    else
      render :new
    end
  end

  def edit
  end

  def update
    if @license_info.update(license_info_params)
      redirect_to settings_path, notice: 'License info was successfully updated.'
    else
      render :edit
    end
  end

  def destroy
    @license_info.destroy
    redirect_to company_settings_path, notice: 'License info was successfully destroyed.'
  end

  private

  def set_license_info
    @license_info = LicenseInfo.find(params[:id])
  end

  def license_info_params
    params.require(:license_info).permit(:license_number, :sfm, :cslb)
  end
end
