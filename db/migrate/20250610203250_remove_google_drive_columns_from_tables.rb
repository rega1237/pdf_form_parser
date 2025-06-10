class RemoveGoogleDriveColumnsFromTables < ActiveRecord::Migration[8.0]
  def change
    remove_column :form_templates, :google_drive_file_id, :string
    remove_column :form_fills, :google_drive_file_id, :string
  end
end
