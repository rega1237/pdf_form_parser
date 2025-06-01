class CreateFormFills < ActiveRecord::Migration[8.0]
  def change
    create_table :form_fills do |t|
      t.string :name
      t.references :form_template, null: false, foreign_key: true

      t.timestamps
    end
  end
end
