class CompanySettingsController < ApplicationController
  def index
    authorize :company_settings, :index?
    @deficiencies = Deficiency.all
    @intervals = IntervalCategory.all
    @system_categories = SystemCategory.all
    @roles = Role.all

    @users = User.all.order(created_at: :desc)
    @new_user = User.new
  end
end
