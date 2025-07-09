class AddUniqueIndexToDeficienciesName < ActiveRecord::Migration[8.0]
  def change
    add_index :deficiencies, :name, unique: true
  end
end
