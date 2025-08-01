class AddDataColumnToFormFills < ActiveRecord::Migration[8.0]
  def change
    add_column :form_fills, :data, :jsonb, default: {} unless column_exists?(:form_fills, :data)

    return if index_exists?(:form_fills, :data)

    add_index :form_fills, :data, using: :gin
  end
end
