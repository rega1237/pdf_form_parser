class CreateCustomers < ActiveRecord::Migration[8.0]
  def change
    create_table :customers do |t|
      t.string :customer_type
      t.string :name
      t.string :address
      t.string :city_state_zip
      t.string :email
      t.string :phone_1
      t.string :phone_2
      t.text :note

      t.timestamps
    end
  end
end
