class CreateFormSubmissions < ActiveRecord::Migration[8.0]
  def change
    create_table :form_submissions do |t|
      t.references :form_template, null: false, foreign_key: true
      t.text :submitted_data
      t.datetime :submitted_at

      t.timestamps
    end
  end
end
