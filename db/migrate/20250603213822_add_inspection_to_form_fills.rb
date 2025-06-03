class AddInspectionToFormFills < ActiveRecord::Migration[8.0]
  def change
    add_reference :form_fills, :inspection, null: true, foreign_key: true
  end
end
