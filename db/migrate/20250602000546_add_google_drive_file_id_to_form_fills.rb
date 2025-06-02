class AddGoogleDriveFileIdToFormFills < ActiveRecord::Migration[8.0]
  def change
    add_column :form_fills, :google_drive_file_id, :string
  end
end
