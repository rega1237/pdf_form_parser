class AddDetailsToUsers < ActiveRecord::Migration[8.0]
  def change
    add_column :users, :name, :string
    add_column :users, :user_level, :string
    add_column :users, :status, :string
  end
end
