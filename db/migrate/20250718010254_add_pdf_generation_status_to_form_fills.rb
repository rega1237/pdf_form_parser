class AddPdfGenerationStatusToFormFills < ActiveRecord::Migration[8.0]
  def change
    add_column :form_fills, :pdf_generation_status, :string, default: 'ready'
  end
end
