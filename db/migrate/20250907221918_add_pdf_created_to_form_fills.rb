class AddPdfCreatedToFormFills < ActiveRecord::Migration[8.0]
  def change
    add_column :form_fills, :pdf_created, :boolean, default: false, null: false
    add_index :form_fills, :pdf_created
  end
end
