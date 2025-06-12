class AddSystemCategoryAndIntervalCategoryToInspections < ActiveRecord::Migration[8.0]
  def change
    add_column :inspections, :system_category, :string
    add_column :inspections, :interval_category, :string
  end
end
