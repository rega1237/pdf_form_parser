class ModifyInspectionsFormRelations < ActiveRecord::Migration[8.0]
  def change
    # Agregar form_template_id a inspections
    add_reference :inspections, :form_template, null: false, foreign_key: true

    # Hacer form_fill_id opcional (nullable)
    change_column_null :inspections, :form_fill_id, true
  end
end
