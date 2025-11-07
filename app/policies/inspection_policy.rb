class InspectionPolicy < ApplicationPolicy
  class Scope < Scope
    def resolve
      # Comprueba el nombre del rol a través de la asociación
      if user && user.role&.level == 'Admin'
        scope.all
      else
        scope.where(user_id: user.id)
      end
    end
  end

  def create?
    user && user.role&.level == 'Admin'
  end

  def show?
    user&.role&.level == 'Admin' || record.user_id == user.id
  end

  def calendar?
    # Permitir acceso al calendario a usuarios autenticados
    # El scope ya maneja qué inspecciones pueden ver
    user.present?
  end

  def update?
    user && user.role&.level == 'Admin'
  end

  def update_status?
    # Permite que el Admin o el dueño de la inspección cambien el estado
    user.present? && (user.role&.level == 'Admin' || record.user_id == user.id)
  end

  def destroy?
    user && user.role&.level == 'Admin'
  end
end
