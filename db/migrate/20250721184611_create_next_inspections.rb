class CreateNextInspections < ActiveRecord::Migration[8.0]
  def change
    create_table :next_inspections do |t|
      t.references :property, null: false, foreign_key: true
      t.references :system_category, null: false, foreign_key: true
      t.references :interval_category, null: false, foreign_key: true
      t.date :next_inspection_date
      t.string :status
      t.text :notes

      t.timestamps
    end
  end
end
