class CreateInspections < ActiveRecord::Migration[8.0]
  def change
    create_table :inspections do |t|
      t.date :date, null: false
      t.references :property, null: false, foreign_key: true
      t.references :form_fill, null: false, foreign_key: true
      t.text :notes
      t.string :status, default: 'pending' # pending, in_progress, completed, cancelled
      
      t.timestamps
    end
    
    add_index :inspections, :date
    add_index :inspections, [:property_id, :date]
    add_index :inspections, :status
  end
end
