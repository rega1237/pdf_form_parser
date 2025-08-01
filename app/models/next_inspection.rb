class NextInspection < ApplicationRecord
  belongs_to :property
  belongs_to :system_category
  belongs_to :interval_category

  # Validación para evitar duplicados
  validates :property_id, uniqueness: {
    scope: %i[system_category_id interval_category_id],
    message: 'already has an inspection scheduled for this system category and interval'
  }

  # Método para encontrar duplicados existentes
  def self.find_duplicate(property_id, system_category_id, interval_category_id)
    where(
      property_id: property_id,
      system_category_id: system_category_id,
      interval_category_id: interval_category_id
    ).first
  end

  # Método para obtener información legible del duplicado
  def duplicate_info
    {
      id: id,
      property_id: property.id,
      property_name: property.property_name,
      customer_name: property.customer.name,
      system_category: system_category.name,
      interval_category: interval_category.name,
      next_inspection_date: next_inspection_date,
      status: status,
      created_at: created_at
    }
  end
end
