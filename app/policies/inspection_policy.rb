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
    user && user.role&.level == 'Admin'
  end

  def update?
    user && user.role&.level == 'Admin'
  end

  def destroy?
    user && user.role&.level == 'Admin'
  end
end
