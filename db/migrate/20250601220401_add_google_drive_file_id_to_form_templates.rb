class AddGoogleDriveFileIdToFormTemplates < ActiveRecord::Migration[8.0]
  def change
    add_column :form_templates, :google_drive_file_id, :string
  end
end
