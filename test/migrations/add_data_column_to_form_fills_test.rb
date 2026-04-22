require "test_helper"

class AddDataColumnToFormFillsTest < Minitest::Test
  def setup
    @connection = ActiveRecord::Base.connection
  end

  def test_migration_adds_data_column_with_correct_type_and_default
    # Check that the data column exists
    assert @connection.column_exists?(:form_fills, :data), "data column should exist"

    # Check that the column is of type jsonb
    column = @connection.columns(:form_fills).find { |c| c.name == "data" }
    assert_equal "jsonb", column.sql_type, "data column should be of type jsonb"

    # Check that the default value is an empty hash (returned as string from DB)
    assert_equal("{}", column.default, "data column should have empty hash as default")
  end

  def test_migration_adds_GIN_index_on_data_column
    # Check that the GIN index exists
    indexes = @connection.indexes(:form_fills)
    data_index = indexes.find { |index| index.columns == [ "data" ] }

    refute_nil data_index, "GIN index on data column should exist"
    assert_equal :gin, data_index.using, "Index should use GIN method"
  end
end
