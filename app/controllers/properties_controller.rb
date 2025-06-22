class PropertiesController < ApplicationController
  before_action :authenticate_user!
  before_action :set_property, only: %i[show edit update destroy]

  def show; end
  def new
    @customer = Customer.find(params[:customer_id])
    @property = @customer.properties.build
  end

  def create
    @customer = Customer.find(params[:property][:customer_id])
    @property = @customer.properties.build(property_params)

    if @property.save
      redirect_to edit_customer_path(@customer), notice: '✅ Property added successfully'
    else
      render :new, status: :unprocessable_entity
    end
  end

  def show
    @customer = @property.customer
  end

  def edit
    @customer = @property.customer
  end

  def update
    @customer = @property.customer
    
    if @property.update(property_params)
      redirect_to edit_customer_path(@customer), notice: '✅ Property updated successfully'
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @customer = @property.customer
    
    if @property.destroy
      redirect_to edit_customer_path(@customer), notice: '✅ Property deleted successfully'
    else
      redirect_to edit_customer_path(@customer), alert: '❌ Failed to delete property'
    end
  end

  private

  def set_property
    @property = Property.find(params[:id])
  end

  def property_params
    params.require(:property).permit(:property_type, :property_name, :address, :city, :zip_code, :construction_type,
                                     :note, :customer_id)
  end
end
