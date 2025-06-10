class AddCategoriesToFormTemplates < ActiveRecord::Migration[8.0]
  def change
    add_column :form_templates, :system_category, :string
    add_column :form_templates, :interval_category, :string
  end
end
