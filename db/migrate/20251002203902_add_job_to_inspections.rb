class AddJobToInspections < ActiveRecord::Migration[8.0]
  def change
    add_column :inspections, :job, :string
  end
end
