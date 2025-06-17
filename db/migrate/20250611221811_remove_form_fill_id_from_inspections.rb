class RemoveFormFillIdFromInspections < ActiveRecord::Migration[8.0]
  def change
    remove_foreign_key :inspections, :form_fills
    remove_column :inspections, :form_fill_id, :bigint
  end
end
