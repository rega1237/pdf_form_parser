class CreateContractorInfos < ActiveRecord::Migration[8.0]
  def change
    create_table :contractor_infos do |t|
      t.string :name
      t.string :address
      t.string :city
      t.string :state
      t.integer :zip
      t.string :phone
      t.integer :job
      t.string :misc

      t.timestamps
    end
  end
end
