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

  private

  def set_next_inspection
    @next_inspection = NextInspection.find(params[:id])
  end
end
