class CompanySettingsController < ApplicationController
  def index
    @deficiencies = Deficiency.all
    @intervals = IntervalCategory.all
    @system_categories = SystemCategory.all

    @users = User.all.order(created_at: :desc)
    @new_user = User.new
  end
end
