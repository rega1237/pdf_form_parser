class CreateDeficiencies < ActiveRecord::Migration[8.0]
  def change
    create_table :deficiencies do |t|
      t.string :name

      t.timestamps
    end
  end
end
