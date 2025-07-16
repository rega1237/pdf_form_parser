class FormTemplatePolicy < ApplicationPolicy
  class Scope < Scope
    def resolve
      user && user.role&.level == 'Admin' ? scope.all : scope.none
    end
  end

  def index?
    user && user.role&.level == 'Admin'
  end

  def show?
    user && user.role&.level == 'Admin'
  end

  def create?
    user && user.role&.level == 'Admin'
  end

  def update?
    user && user.role&.level == 'Admin'
  end

  def destroy?
    uuser && user.role&.level == 'Admin'
  end
  
  def form_builder?
    user && user.role&.level == 'Admin'
  end

  def form_builder_update?
    user && user.role&.level == 'Admin'
  end
end
