class DropNextInspections < ActiveRecord::Migration[8.0]
  def change
    drop_table :next_inspections
  end
end
