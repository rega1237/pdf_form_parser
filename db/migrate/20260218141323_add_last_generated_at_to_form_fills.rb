class AddLastGeneratedAtToFormFills < ActiveRecord::Migration[8.0]
  def change
    add_column :form_fills, :last_generated_at, :datetime
  end
end
