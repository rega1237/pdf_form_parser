class CustomersController < ApplicationController
  before_action :set_customer, only: %i[show edit update]

  def index
    @customers = policy_scope(Customer)
  end

  def show
    authorize @customer
  end

  def new
    authorize Customer
    @customer = Customer.new
  end

  def create
    authorize Customer
    @customer = Customer.new(customer_params)
    if @customer.save
      redirect_to @customer, notice: 'Customer was successfully created.'
    else
      render :new
    end
  end

  def edit
    authorize @customer
  end

  def update
    authorize @customer
    if @customer.update(customer_params)
      redirect_to @customer, notice: 'Customer was successfully updated.'
    else
      render :edit
    end
  end

  private

  def set_customer
    @customer = Customer.find(params[:id])
  end

  def customer_params
    params.require(:customer).permit(:thumbnail, :customer_type, :name, :address, :city_state_zip, :email, :phone_1,
                                     :phone_2, :note)
  end
end
