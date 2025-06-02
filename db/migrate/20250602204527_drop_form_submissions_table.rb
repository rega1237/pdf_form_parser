class DropFormSubmissionsTable < ActiveRecord::Migration[8.0]
  def change
    drop_table :form_submissions
  end
end
