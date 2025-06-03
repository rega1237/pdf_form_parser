# app/controllers/inspections_controller.rb
class InspectionsController < ApplicationController
  before_action :set_inspection, only: %i[show edit update destroy]
  before_action :load_form_data, only: %i[new create edit update]

  # GET /inspections
  def index
    @inspections = Inspection.includes(:property, :form_fill, property: :customer)
                             .order(date: :desc)

    # Filtros opcionales
    @inspections = @inspections.where(status: params[:status]) if params[:status].present?
    if params[:customer_id].present?
      @inspections = @inspections.joins(:property).where(properties: { customer_id: params[:customer_id] })
    end
    if params[:from_date].present? && params[:to_date].present?
      @inspections = @inspections.where(date: Date.parse(params[:from_date])..Date.parse(params[:to_date]))
    end

    @inspections = @inspections.page(params[:page]).per(20) if defined?(Kaminari)

    # Para los filtros en la vista
    @customers = Customer.order(:name)
    @statuses = Inspection.distinct.pluck(:status).compact
  end

  # GET /inspections/1
  def show
    @property = @inspection.property
    @customer = @property.customer
    @form_template = @inspection.form_template
    @form_fill = @inspection.form_fill
  end

  # GET /inspections/new
  def new
    @inspection = Inspection.new

    # Pre-cargar si viene de una propiedad específica
    return unless params[:property_id].present?

    @inspection.property_id = params[:property_id]
    @selected_customer = Property.find(params[:property_id]).customer
  end

  # GET /inspections/1/edit
  def edit
    @selected_customer = @inspection.property.customer
  end

  # POST /inspections
  def create
    @inspection = Inspection.new(inspection_params)

    if @inspection.save
      redirect_to @inspection, notice: 'Inspección creada exitosamente.'
    else
      @selected_customer = @inspection.property&.customer
      render :new, status: :unprocessable_entity
    end
  end

  # PATCH/PUT /inspections/1
  def update
    if @inspection.update(inspection_params)
      redirect_to @inspection, notice: 'Inspección actualizada exitosamente.'
    else
      @selected_customer = @inspection.property.customer
      render :edit, status: :unprocessable_entity
    end
  end

  # DELETE /inspections/1
  def destroy
    @inspection.destroy
    redirect_to inspections_url, notice: 'Inspección eliminada exitosamente.'
  end

  # GET /inspections/calendar
  def calendar
    @inspections = Inspection.includes(:property, property: :customer)

    # Filtrar por mes si se especifica
    if params[:month].present? && params[:year].present?
      start_date = Date.new(params[:year].to_i, params[:month].to_i, 1)
      end_date = start_date.end_of_month
      @inspections = @inspections.where(date: start_date..end_date)
    else
      # Por defecto mostrar el mes actual
      @inspections = @inspections.where(date: Date.current.beginning_of_month..Date.current.end_of_month)
    end

    @inspections_by_date = @inspections.group_by(&:date)
  end

  # PATCH /inspections/1/update_status
  def update_status
    @inspection = Inspection.find(params[:id])

    if @inspection.update(status: params[:status])
      render json: { success: true, message: 'Estado actualizado', status: @inspection.status }
    else
      render json: { success: false, errors: @inspection.errors.full_messages }
    end
  end

  # GET /inspections/dashboard
  def dashboard
    @total_inspections = Inspection.count
    @pending_inspections = Inspection.where(status: 'pending').count
    @completed_inspections = Inspection.where(status: 'completed').count
    @this_month_inspections = Inspection.where(date: Date.current.beginning_of_month..Date.current.end_of_month).count

    @upcoming_inspections = Inspection.includes(:property, property: :customer)
                                      .where(date: Date.current..1.week.from_now)
                                      .where(status: %w[pending in_progress])
                                      .order(:date)
                                      .limit(10)

    @recent_inspections = Inspection.includes(:property, property: :customer)
                                    .order(created_at: :desc)
                                    .limit(10)
  end

  # GET /properties/:property_id/inspections
  def by_property
    @property = Property.find(params[:property_id])
    @customer = @property.customer
    return unless defined?(Kaminari)

    @inspections = @property.inspections.includes(:form_fill)
                            .order(date: :desc)
                            .page(params[:page]).per(10)
  end

  # API endpoint para obtener propiedades por customer (AJAX)
  # GET /inspections/properties_by_customer
  def properties_by_customer
    if params[:customer_id].present?
      @properties = Property.where(customer_id: params[:customer_id]).order(:property_name)
      render json: @properties.map { |p| { id: p.id, name: "#{p.property_name} - #{p.address}" } }
    else
      render json: []
    end
  end

  private

  def set_inspection
    @inspection = Inspection.find(params[:id])
  end

  def inspection_params
    params.require(:inspection).permit(:date, :property_id, :form_template_id, :form_fill_id, :notes, :status)
  end

  def load_form_data
    @customers = Customer.order(:name)
    @form_templates = FormTemplate.order(:name)
    @properties = []

    # Si ya hay un customer seleccionado, cargar sus propiedades
    if params[:inspection] && params[:inspection][:property_id].present?
      property = Property.find(params[:inspection][:property_id])
      @properties = property.customer.properties.order(:property_name)
      @selected_customer = property.customer
    elsif @inspection&.property
      @selected_customer = @inspection.property.customer
      @properties = @selected_customer.properties.order(:property_name)
    end
  end
end
