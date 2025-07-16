class CompanySettingsPolicy < ApplicationPolicy
  def index?
    user && user.role&.level == 'Admin'
  end
end
