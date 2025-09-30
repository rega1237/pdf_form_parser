class CreateLicenseInfos < ActiveRecord::Migration[8.0]
  def change
    create_table :license_infos do |t|
      t.string :license_number
      t.boolean :sfm
      t.boolean :cslb

      t.timestamps
    end
  end
end
