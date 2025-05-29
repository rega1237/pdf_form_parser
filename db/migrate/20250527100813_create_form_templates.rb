class CreateFormTemplates < ActiveRecord::Migration[8.0]
  def change
    create_table :form_templates do |t|
      t.string :name
      t.string :original_filename
      t.string :file_path
      t.string :file_type
      t.text :form_structure
      t.timestamps
    end
  end
end
