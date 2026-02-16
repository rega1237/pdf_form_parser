# app/controllers/inspections_controller.rb
class InspectionsController < ApplicationController
  before_action :set_inspection, only: %i[show edit update destroy update_status]
  before_action :load_form_data, only: %i[new create edit update]
  before_action :set_intervals, only: %i[new create edit update]
  before_action :load_form_data, only: %i[new create edit update]
  before_action :load_technicians, only: %i[new create edit update]
  before_action :set_intervals, only: %i[new create edit update]
  before_action :set_system_categories, only: %i[new create edit update]

  # GET /inspections
  def index
    @inspections = policy_scope(Inspection)
                   .includes(:property, { form_fills: :form_template }, :user, property: :customer)
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

  def show
    authorize @inspection
    @property = @inspection.property
    @customer = @property.customer
    @form_template = @inspection.form_template

    # Buscar el formulario principal específico
    @form_fill = @inspection.form_fills.find_by(form_template_id: @inspection.form_template_id)

    # Buscar los formularios adicionales
    @additional_risers_form_fill = @inspection.form_fills.joins(:form_template).find_by(form_templates: { name: 'Additional Risers' })
    @corrections_form_fill = @inspection.form_fills.joins(:form_template).find_by(form_templates: { name: 'Corrected Deficiencies' })

    # Calcular conteos del formulario principal si existe
    @form_counts = @form_fill&.calculate_form_counts || { pass: 0, fail: 0, na: 0 }
  end

  # GET /inspections/new
  def new
    @inspection = Inspection.new

    if params[:property_id].present?
      @property = Property.find(params[:property_id])
      @inspection.property_id = @property.id
      @selected_customer = @property.customer
      @properties = @selected_customer.properties.order(:property_name)

      # Asignar valores pre-seleccionados si vienen en los parámetros
      @inspection.system_category = params[:system_category] if params[:system_category].present?
      @inspection.interval_category = params[:interval_category] if params[:interval_category].present?
      @inspection.date = params[:date] if params[:date].present?
    else
      @properties = []
      @selected_customer = nil
    end

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

      # 1. Create main form fill
      if main_form_template
        form_fill_name = "#{property.property_name} - #{system_category} - #{interval_category}"
        FormFill.create!(
          name: form_fill_name,
          form_template: main_form_template,
          inspection: @inspection,
          form_structure: main_form_template.form_structure
        )
      end

      # 2. Create deficiencies form fill
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
        Rails.logger.warn("ADVERTENCIA: No se encontró la plantilla de formulario 'Deficiencies'.")
      end

      # 3. Create additional risers form fill
      additional_risers_template = FormTemplate.find_by(name: 'Additional Risers')
      if additional_risers_template
        additional_risers_form_name = "#{property.property_name} - Additional Risers"
        FormFill.create!(
          name: additional_risers_form_name,
          form_template: additional_risers_template,
          inspection: @inspection,
          form_structure: additional_risers_template.form_structure
        )
      else
        Rails.logger.warn("ADVERTENCIA: No se encontró la plantilla de formulario 'Additional Risers'.")
      end

      # 4. Create corrections form fill
      corrections_template = FormTemplate.find_by(name: 'Corrected Deficiencies')
      if corrections_template
        corrections_form_name = "#{property.property_name} - Corrected Deficiencies"
        FormFill.create!(
          name: corrections_form_name,
          form_template: corrections_template,
          inspection: @inspection,
          form_structure: corrections_template.form_structure
        )
      else
        Rails.logger.warn("ADVERTENCIA: No se encontró la plantilla de formulario 'Corrected Deficiencies'.")
      end

      # Llama al servicio para autocompletar el encabezado DESPUÉS de crear los formularios.
      HeaderAutoFillerService.new(@inspection).call
    end

    redirect_to @inspection, notice: 'Inspection created successfully.'
  rescue ActiveRecord::RecordInvalid => e
    @selected_customer = @inspection.property&.customer
    @inspection.errors.add(:base, "Error al crear la inspección o sus formularios: #{e.message}")
    render :new, status: :unprocessable_entity
  end

  # PATCH/PUT /inspections/1
  def update
    if @inspection.update(inspection_params)
      redirect_to @inspection, notice: 'Inspection updated successfully.'
    else
      @selected_customer = @inspection.property.customer
      render :edit, status: :unprocessable_entity
    end
  end

  # PATCH /inspections/:id/update_status
  def update_status
    authorize @inspection, :update_status?

    new_status = params[:status].presence || 'completed'
    allowed_statuses = %w[pending in_progress completed canceled]

    respond_to do |format|
      if allowed_statuses.include?(new_status) && @inspection.update(status: new_status)
        format.html { redirect_to inspection_path(@inspection), notice: "Inspección marcada como #{new_status}." }
        format.json { render json: { success: true, status: @inspection.status }, status: :ok }
      else
        errors = ['Estado inválido.']
        format.html { redirect_to inspection_path(@inspection), alert: 'Invalid Status.' }
        format.json { render json: { success: false, errors: errors }, status: :unprocessable_entity }
      end
    end
  end

  # DELETE /inspections/1
  def destroy
    authorize @inspection
    @inspection.destroy
    redirect_to inspections_url, notice: 'Inspection deleted successfully.'
  end

  # GET /inspections/calendar
  def calendar
    # Autorizar la acción calendar usando un símbolo
    authorize :inspection, :calendar?

    # Obtener la fecha del parámetro o usar la fecha actual
    @current_date = params[:date] ? Date.parse(params[:date]) : Date.current
    @current_date = @current_date.beginning_of_month

    # Obtener todas las inspecciones del mes actual usando policy_scope
    month_start = @current_date.beginning_of_month
    month_end = @current_date.end_of_month

    @month_inspections = policy_scope(Inspection).includes(:property, :user, property: :customer)
                                                 .where(date: month_start..month_end)
                                                 .order(:date)

    # Preparar estadísticas por técnico (sin el ORDER BY que causa problemas)
    @technician_stats = policy_scope(Inspection).where(date: month_start..month_end)
                                                .group(:user_id)
                                                .count

    # Inicializar @inspections para usar en la vista (usando el mismo scope)
    @inspections = policy_scope(Inspection)

    # Crear estructura del calendario
    @calendar_days = []

    # Comenzar desde el domingo de la semana que contiene el primer día del mes
    start_date = month_start.beginning_of_week(:sunday)
    # Terminar en el sábado de la semana que contiene el último día del mes
    end_date = month_end.end_of_week(:sunday)

    current_date = start_date
    while current_date <= end_date
      # Obtener inspecciones para este día
      day_inspections = @month_inspections.select do |inspection|
        inspection.date == current_date
      end

      @calendar_days << {
        date: current_date,
        current_month: current_date.month == @current_date.month,
        today: current_date == Date.current,
        inspections: day_inspections
      }

      current_date += 1.day
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
                                       :system_category, :interval_category, :user_id, :job)
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
    return @technicians = User.none unless technician_role

    @technicians = technician_role.users.active.order(:email)

    # Si la inspección ya tiene un técnico asignado que está inactivo, lo incluimos en la lista
    if @inspection&.user_id.present? && !@inspection.user.is_active?
      @technicians = User.where(id: @technicians.pluck(:id) + [@inspection.user_id]).order(:email)
    end
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
