class CreateProperties < ActiveRecord::Migration[8.0]
  def change
    create_table :properties do |t|
      t.references :customer, null: false, foreign_key: true
      t.string :property_type
      t.string :property_name
      t.string :address
      t.string :city
      t.string :zip_code
      t.string :construction_type
      t.text :note

      t.timestamps
    end
  end
end
