class NextInspectionPolicy < ApplicationPolicy
  class Scope < Scope
    def resolve
      # Solo los administradores o desarrolladores pueden ver todas las inspecciones programadas.
      # Otros roles no verán ninguna en la vista de índice principal.
      if user && (user.admin? || user.developer?)
        scope.all
      else
        # Si quisieras que los técnicos vieran las de sus propiedades asignadas,
        # la lógica iría aquí, pero por ahora lo mantenemos simple.
        scope.none
      end
    end
  end

  # Los administradores pueden ver la lista de próximas inspecciones.
  def index?
    admin_or_developer?
  end

  # Los administradores pueden ver el detalle de una próxima inspección.
  def show?
    admin_or_developer?
  end

  # Los administradores pueden crear una inspección real a partir de una programada.
  def create_inspection_from_next?
    admin_or_developer?
  end

  # Por ahora, no permitimos la creación, actualización o eliminación directa
  # de NextInspections desde la UI, ya que se crean automáticamente.
  def create?
    false
  end

  def update?
    false
  end

  def destroy?
    admin_or_developer?
  end

  # Permitir eliminar en el contexto de resolución de duplicados
  def destroy_for_duplicate?
    user&.admin? || user&.developer? || user&.role&.level == 'Technician'
  end

  # Permitir manejar duplicados tanto a Admin como a Technician
  # ya que los técnicos completan formularios y pueden generar duplicados
  def handle_duplicate?
    user&.admin? || user&.developer? || user&.role&.level == 'Technician'
  end
end
