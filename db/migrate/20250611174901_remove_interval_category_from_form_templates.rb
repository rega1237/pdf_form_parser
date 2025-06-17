class RemoveIntervalCategoryFromFormTemplates < ActiveRecord::Migration[8.0]
  def change
    remove_column :form_templates, :interval_category, :string
  end
end
