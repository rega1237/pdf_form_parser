class CreateFormTemplatesIntervalCategories < ActiveRecord::Migration[8.0]
  def change
    create_table :form_templates_interval_categories, id: false do |t|
      t.references :form_template, null: false, foreign_key: true
      t.references :interval_category, null: false, foreign_key: true
      t.timestamps
    end
  
  add_index :form_templates_interval_categories, [:form_template_id, :interval_category_id], 
            unique: true, 
            name: 'index_form_templates_interval_categories_unique'
  end
end
