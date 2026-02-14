class FormTemplatePolicy < ApplicationPolicy
  class Scope < Scope
    def resolve
      user && user.developer? ? scope.all : scope.none
    end
  end

  def index?
    developer?
  end

  def show?
    developer?
  end

  def create?
    developer?
  end

  def update?
    developer?
  end

  def destroy?
    developer?
  end

  def form_builder?
    developer?
  end

  def form_builder_update?
    developer?
  end
end
