class CompanySettingsPolicy < ApplicationPolicy
  def index?
    admin_or_developer?
  end
end
