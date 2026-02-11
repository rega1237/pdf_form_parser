class ContractorInfoPolicy < ApplicationPolicy
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
