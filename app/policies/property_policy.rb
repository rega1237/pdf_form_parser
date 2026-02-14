class PropertyPolicy < ApplicationPolicy
  def index?
    admin_or_developer?
  end

  def show?
    admin_or_developer?
  end

  def create?
    admin_or_developer?
  end

  def update?
    admin_or_developer?
  end

  def destroy?
    admin_or_developer?
  end

  class Scope < Scope
    def resolve
      if user.admin? || user.developer?
        scope.all
      else
        scope.none
      end
    end
  end
end
