# frozen_string_literal: true

# Controller for managing next scheduled inspections
# Handles viewing upcoming inspections and creating new inspections from scheduled ones
class NextInspectionsController < ApplicationController
  before_action :set_next_inspection, only: %i[show create_inspection_from_next]

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
    ), notice: 'Formulario listo para crear la inspección. Por favor, asigna un técnico.'
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
end
