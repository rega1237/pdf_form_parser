# frozen_string_literal: true

# Controller for managing next scheduled inspections
# Handles viewing upcoming inspections and creating new inspections from scheduled ones
class NextInspectionsController < ApplicationController
  before_action :set_next_inspection, only: %i[show create_inspection_from_next destroy]

  def index
    # Por defecto, muestra las inspecciones del próximo mes
    @next_inspections = policy_scope(NextInspection)
    @from_date = params[:from_date].presence || Date.current.beginning_of_day
    @to_date = params[:to_date].presence || 1.month.from_now.end_of_day

    @next_inspections = NextInspection.includes(property: :customer, system_category: {}, interval_category: {})
                                      .where(next_inspection_date: @from_date..@to_date)
                                      .order(:next_inspection_date)
  end

  def show
    authorize @next_inspection
  end

  def create_inspection_from_next
    authorize @next_inspection, :create_inspection_from_next?
    # Preparamos los datos para enviar al formulario de nueva inspección
    property = @next_inspection.property
    system_category = @next_inspection.system_category.name
    interval_category = @next_inspection.interval_category.name

    # Redirigimos al formulario, pasando los datos que ya conocemos
    redirect_to new_inspection_path(
      property_id: property.id,
      system_category: system_category,
      interval_category: interval_category,
      date: @next_inspection.next_inspection_date
    ), notice: 'Form ready to create the inspection. Please assign a technician.'
  end

  def destroy
    authorize @next_inspection
    @next_inspection.destroy
    redirect_to next_inspections_path, notice: 'Next inspection successfully deleted.'
  end

  def handle_duplicate
    # Autorizar la acción de manejar duplicados
    authorize :next_inspection, :handle_duplicate?

    duplicate_info = session[:duplicate_next_inspection]

    unless duplicate_info
      # Redirigir según el rol del usuario
      if current_user.admin? || current_user.developer?
        redirect_to next_inspections_path, alert: 'No duplicate information was found.'
      else
        redirect_to inspections_path, alert: 'No duplicate information was found.'
      end
      return
    end

    if params[:action_type] == 'delete_existing'
      # Eliminar la next inspection existente
      existing_next_inspection = NextInspection.find(duplicate_info['existing']['id'])
      # Para eliminar en contexto de duplicado, usar el método específico
      authorize existing_next_inspection, :destroy_for_duplicate?
      existing_next_inspection.destroy

      # Crear la nueva next inspection
      create_new_next_inspection_from_session

      # Obtener el form_fill_id antes de limpiar la sesión
      form_fill_id = duplicate_info['form_fill_id']
      session.delete(:duplicate_next_inspection)

      # Si hay un form_fill_id, proceder con la generación del PDF
      if form_fill_id.present?
        generate_pdf_for_form_fill(form_fill_id)
        redirect_to form_fill_path(form_fill_id),
                    notice: 'Previous inspection deleted and new one created. PDF being generated.'
      elsif current_user.admin? || current_user.developer?
        # Redirigir según el rol del usuario si no hay form_fill
        redirect_to next_inspections_path, notice: 'Previous inspection deleted and new one successfully created.'
      else
        redirect_to inspections_path, notice: 'Previous inspection deleted and new one successfully created.'
      end
    elsif params[:action_type] == 'keep_existing'
      # Mantener la existente, no crear nueva
      form_fill_id = duplicate_info['form_fill_id']
      session.delete(:duplicate_next_inspection)

      # Si hay un form_fill_id, proceder con la generación del PDF
      if form_fill_id.present?
        generate_pdf_for_form_fill(form_fill_id)
        redirect_to form_fill_path(form_fill_id),
                    notice: 'The existing next inspection was retained. PDF being generated.'
      elsif current_user.admin? || current_user.developer?
        # Redirigir según el rol del usuario si no hay form_fill
        redirect_to next_inspections_path, notice: 'The existing next inspection was maintained.'
      else
        redirect_to inspections_path, notice: 'The existing next inspection was maintained.'
      end
    elsif params[:action_type] == 'cancel'
      # Cancelar la generación del PDF, limpiar sesión y regresar al form_fill
      form_fill_id = duplicate_info['form_fill_id']
      session.delete(:duplicate_next_inspection)

      if form_fill_id.present?
        redirect_to form_fill_path(form_fill_id),
                    notice: 'PDF generation canceled. No Next Inspection was created.'
      elsif current_user.role.level == 'Admin'
        redirect_to next_inspections_path, notice: 'Action canceled.'
      else
        redirect_to inspections_path, notice: 'Action canceled.'
      end
    elsif current_user.role.level == 'Admin'
      # Redirigir según el rol del usuario en caso de error
      redirect_to next_inspections_path, alert: 'Invalid action.'
    else
      redirect_to inspections_path, alert: 'Invalid action.'
    end
  end

  def calendar
    # Obtener la fecha del parámetro o usar la fecha actual
    @current_date = params[:date] ? Date.parse(params[:date]) : Date.current
    @current_date = @current_date.beginning_of_month

    # Obtener todas las inspecciones del mes actual
    month_start = @current_date.beginning_of_month
    month_end = @current_date.end_of_month

    @month_inspections = NextInspection.includes(:property, :system_category, :interval_category)
                                       .joins(property: :customer)
                                       .where(next_inspection_date: month_start..month_end)
                                       .order(:next_inspection_date)

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
        inspection.next_inspection_date == current_date
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

  private

  def set_next_inspection
    @next_inspection = NextInspection.find(params[:id])
  end

  def generate_pdf_for_form_fill(form_fill_id)
    form_fill = FormFill.find(form_fill_id)

    # Verificar si ya se está generando un PDF
    return if form_fill.generating?

    # Marcar como generando antes de encolar el trabajo
    form_fill.update!(pdf_generation_status: 'generating')

    # Encolar el trabajo de generación de PDF
    GeneratePdfJob.perform_later(form_fill.id)

    Rails.logger.info "PDF generation started for FormFill ##{form_fill.id} after duplicate resolution"
  rescue StandardError => e
    Rails.logger.error "Error starting PDF generation for FormFill ##{form_fill_id}: #{e.message}"
  end

  def create_new_next_inspection_from_session
    duplicate_info = session[:duplicate_next_inspection]
    return unless duplicate_info

    begin
      # Recrear los objetos necesarios usando información más confiable
      existing_info = duplicate_info['existing']

      # Buscar por ID si está disponible, sino por nombre
      property = if existing_info['property_id']
                   Property.find(existing_info['property_id'])
                 else
                   Property.joins(:customer)
                           .where(property_name: existing_info['property_name'])
                           .where(customers: { name: existing_info['customer_name'] })
                           .first
                 end

      system_category = SystemCategory.find_by(name: existing_info['system_category'])
      interval_category = IntervalCategory.find_by(name: existing_info['interval_category'])

      return unless property && system_category && interval_category

      NextInspection.create!(
        property: property,
        system_category: system_category,
        interval_category: interval_category,
        next_inspection_date: Date.parse(duplicate_info['new_date'].to_s),
        status: 'scheduled'
      )

      Rails.logger.info "New next inspection created after duplicate resolution for property #{property.id}"
    rescue StandardError => e
      Rails.logger.error "Failed to create new next inspection from session: #{e.message}"
    end
  end
end
