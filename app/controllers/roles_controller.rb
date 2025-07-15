class RolesController < ApplicationController
  before_action :authenticate_user!
  before_action :set_role, only: %i[show edit update destroy]

  def index
    @roles = Role.all
  end

  def show; end

  def edit; end

  def update
    if @role.update(role_params)
      redirect_to settings_path, notice: '✅ Role updated successfully'
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def new
    @role = Role.new
  end

  def create
    @role = Role.new(role_params)

    if @role.save
      redirect_to settings_path, notice: '✅ Role created successfully'
    else
      redirect_to settings_path, status: :unprocessable_entity
    end
  end

  def destroy
    if @role.destroy
      redirect_to settings_path, notice: '✅ Role deleted successfully'
    else
      redirect_to settings_path, alert: '❌ Failed to delete role'
    end
  end

  private

  def set_role
    @role = Role.find(params[:id])
  end

  def role_params
    params.require(:role).permit(:level)
  end
end
