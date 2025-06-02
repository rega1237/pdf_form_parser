class PropertiesController < ApplicationController
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
      redirect_to edit_customer_path(@customer), alert: '❌ Failed to add property'
    end
  end

  private

  def property_params
    params.require(:property).permit(:property_type, :property_name, :address, :city, :zip_code, :construction_type,
                                     :note, :customer_id)
  end
end
