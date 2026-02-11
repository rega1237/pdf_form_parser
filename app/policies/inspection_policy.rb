class InspectionPolicy < ApplicationPolicy
  class Scope < Scope
    def resolve
      # Comprueba el nombre del rol a través de la asociación
      if user && (user.admin? || user.developer?)
        scope.all
      else
        scope.where(user_id: user.id)
      end
    end
  end

  def create?
    user && (user.admin? || user.developer?)
  end

  def show?
    user&.admin? || user&.developer? || record.user_id == user.id
  end

  def calendar?
    # Permitir acceso al calendario a usuarios autenticados
    # El scope ya maneja qué inspecciones pueden ver
    user.present?
  end

  def update?
    user && (user.admin? || user.developer?)
  end

  def update_status?
    # Permite que el Admin o el dueño de la inspección cambien el estado
    user.present? && (user.admin? || user.developer? || record.user_id == user.id)
  end

  def destroy?
    user && (user.admin? || user.developer?)
  end
end
