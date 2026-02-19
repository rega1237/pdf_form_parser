class Customer < ApplicationRecord
  has_one_attached :thumbnail
  has_many :properties, dependent: :destroy
  has_many :inspections, through: :properties

  scope :search_by_name, ->(query) { where("name ILIKE ?", "%#{query}%") }
end
