class AddDurationInMonthsToIntervalCategories < ActiveRecord::Migration[8.0]
  def change
    add_column :interval_categories, :duration_in_months, :integer
  end
end
