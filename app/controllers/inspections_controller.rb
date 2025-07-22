# app/controllers/inspections_controller.rb
class InspectionsController < ApplicationController
  before_action :set_inspection, only: %i[show edit update destroy]
  before_action :load_form_data, only: %i[new create edit update]
  before_action :set_intervals, only: %i[new create edit update]
  before_action :load_form_data, only: %i[new create edit update]
  before_action :load_technicians, only: %i[new create edit update]
  before_action :set_intervals, only: %i[new create edit update]
  before_action :set_system_categories, only: %i[new create edit update]

  # GET /inspections
  def index
    @inspections = policy_scope(Inspection)
                   .includes(:property, :form_fills, :user, property: :customer)
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
    authorize @inspection
    @property = @inspection.property
    @customer = @property.customer
    @form_template = @inspection.form_template

    # Buscar el formulario principal específico
    @form_fill = @inspection.form_fills.find_by(form_template_id: @inspection.form_template_id)
    
    # Calcular conteos del formulario principal si existe
    @form_counts = @form_fill&.calculate_form_counts || { pass: 0, fail: 0, na: 0 }
  end

  # GET /inspections/new
  def new
    @inspection = Inspection.new

    authorize @inspection

    if params[:property_id].present?
      @property = Property.find(params[:property_id])
      @inspection.property_id = params[:property_id]
      @selected_customer = @property.customer
      @properties = @selected_customer.properties.order(:property_name)
    else
      @properties = []
      @selected_customer = nil
    end
  end

  # POST /inspections
  def create
    @inspection = Inspection.new(inspection_params)

    authorize @inspection

    main_form_template = get_form_template(inspection_params)
    @inspection.form_template_id = main_form_template&.id

    ActiveRecord::Base.transaction do
      @inspection.save!

      property = @inspection.property
      system_category = inspection_params[:system_category]
      interval_category = inspection_params[:interval_category]

      if main_form_template
        form_fill_name = "#{property.property_name} - #{system_category} - #{interval_category}"
        FormFill.create!(
          name: form_fill_name,
          form_template: main_form_template,
          inspection: @inspection,
          form_structure: main_form_template.form_structure
        )
      end

      deficiencies_template = FormTemplate.find_by(name: 'Deficiencies')
      if deficiencies_template
        deficiencies_form_name = "#{property.property_name} - Deficiencies"
        FormFill.create!(
          name: deficiencies_form_name,
          form_template: deficiencies_template,
          inspection: @inspection,
          form_structure: deficiencies_template.form_structure
        )
      else
        Rails.logger.warn("ADVERTENCIA: No se encontró la plantilla de formulario 'Deficiencies'. No se creó el formulario de deficiencias.")
      end
    end

    redirect_to @inspection, notice: 'Inspección creada exitosamente con sus dos formularios.'
  rescue ActiveRecord::RecordInvalid => e
    @selected_customer = @inspection.property&.customer
    @inspection.errors.add(:base, "Error al crear la inspección o sus formularios: #{e.message}")
    render :new, status: :unprocessable_entity
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
    authorize @inspection
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
  # GET /properties/:property_id/inspections
  def by_property
    @property = Property.find(params[:property_id])
    @customer = @property.customer

    # Cargar inspecciones con paginación
    @inspections = @property.inspections.includes(:form_fills)
                            .order(date: :desc)
                            .page(params[:page])
                            .per(10) # 10 inspecciones por página

    # Para los totales en la tarjeta de resumen (sin paginación)
    @total_inspections = @property.inspections.count
    @completed_inspections = @property.inspections.where(status: 'completed').count
    @pending_inspections = @property.inspections.where(status: 'pending').count
    @due_soon_inspections = @property.inspections.where('date > ? AND date <= ?', Date.current, 3.days.from_now).count
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

  def set_system_categories
    @system_categories = SystemCategory.all
  end

  def set_intervals
    @intervals = IntervalCategory.all
  end

  def inspection_params
    params.require(:inspection).permit(:date, :property_id, :notes, :status,
                                       :system_category, :interval_category, :user_id)
  end

  def load_form_data
    @customers = Customer.order(:name)
    @form_templates = FormTemplate.order(:name)
    @properties = [] unless defined?(@properties) && @properties.present?
    @selected_customer = nil unless defined?(@selected_customer)

    if params[:property_id].present? && @selected_customer.nil?
      @property = Property.find(params[:property_id])
      @selected_customer = @property.customer
      @properties = @selected_customer.properties.order(:property_name)
    elsif params[:inspection] && params[:inspection][:property_id].present?
      property = Property.find(params[:inspection][:property_id])
      @properties = property.customer.properties.order(:property_name)
      @selected_customer = property.customer
    elsif @inspection&.property
      @selected_customer = @inspection.property.customer
      @properties = @selected_customer.properties.order(:property_name)
    end
  end

  def load_technicians
    technician_role = Role.find_by(level: 'Technician')
    @technicians = technician_role ? technician_role.users.order(:email) : User.none
  end

  def get_form_template(params)
    form_template_system = FormTemplate.where(system_category: params[:system_category])
    form_template_system.each do |template|
      # Check if any of the associated interval categories have a name that matches params[:interval_category]
      return template if template.interval_categories.any? { |ic| ic.name == params[:interval_category] }
    end
    nil # Return nil if no matching template is found
  end
end
