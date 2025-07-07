class CompanySettingsController < ApplicationController
  def index
    @deficiencies = Deficiency.all
    @intervals = IntervalCategory.all
    @system_categories = SystemCategory.all
  end
end
