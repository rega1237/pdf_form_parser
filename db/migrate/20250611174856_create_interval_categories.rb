class CreateIntervalCategories < ActiveRecord::Migration[8.0]
  def change
    create_table :interval_categories do |t|
      t.string :name, null: false
      t.timestamps
    end
  end
end
