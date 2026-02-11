class Admin::UsersController < ApplicationController
  before_action :authenticate_user!
  before_action :set_user, only: %i[edit update destroy update_role]

  def new
    authorize User
    @user = User.new
  end

  def edit
    authorize @user
  end

  def create
    @user = User.new(user_params)
    authorize @user
    # Asigna la contraseña por defecto
    @user.password = "aespro1234"
    @user.password_confirmation = "aespro1234"

    if @user.save
      redirect_to settings_path, notice: "User was successfully created."
    else
      redirect_to settings_path, status: :unprocessable_entity
    end
  end

  def update
    authorize @user
    # Filtra los parámetros para no requerir la contraseña si está en blanco
    params_to_update = user_params
    if params_to_update[:password].blank?
      params_to_update.delete(:password)
      params_to_update.delete(:password_confirmation)
    end

    if @user.update(params_to_update)
      redirect_to admin_users_path, notice: "User was successfully updated."
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    authorize @user
    if @user.is_active?
      @user.deactivate!
      message = "User was successfully deactivated."
    else
      @user.activate!
      message = "User was successfully activated."
    end
    redirect_to settings_path, notice: message
  end

  def update_role
    authorize @user, :change_role?
    if @user.update(role_id: params[:role_id])
      redirect_to settings_path, notice: "User role updated successfully."
    else
      redirect_to settings_path, alert: "Failed to update user role."
    end
  end

  private

  def set_user
    @user = User.find(params[:id])
  end

  def user_params
    params.require(:user).permit(:email, :name, :password, :password_confirmation, :role_id)
  end
end
