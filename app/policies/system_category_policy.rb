class SystemCategoryPolicy < ApplicationPolicy
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
end
