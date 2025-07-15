class CustomerPolicy < ApplicationPolicy
  class Scope < Scope
    def resolve
      user.role&.level == 'Admin' ? scope.all : scope.none
    end
  end

  def index?
    user.role&.level == 'Admin'
  end

  def show?
    user.role&.level == 'Admin'
  end

  def create?
    user.role&.level == 'Admin'
  end

  def update?
    user.role&.level == 'Admin'
  end

  def destroy?
    user.role&.level == 'Admin'
  end
end
