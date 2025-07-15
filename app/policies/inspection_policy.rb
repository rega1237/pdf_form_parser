class InspectionPolicy < ApplicationPolicy
  class Scope < Scope
    def resolve
      # Comprueba el nombre del rol a través de la asociación
      if user.role&.level == 'Admin'
        scope.all
      else
        scope.where(user_id: user.id)
      end
    end
  end

  def create?
    user.role&.level == 'Admin'
  end

  def show?
    user.role&.level == 'Admin' || record.user_id == user.id
  end

  def update?
    user.role&.level == 'Admin' || record.user_id == user.id
  end

  def destroy?
    user.role&.level == 'Admin'
  end
end
