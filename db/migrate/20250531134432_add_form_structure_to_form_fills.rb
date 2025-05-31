class AddFormStructureToFormFills < ActiveRecord::Migration[8.0]
  def change
    add_column :form_fills, :form_structure, :string
  end
end
