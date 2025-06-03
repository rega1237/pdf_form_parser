class Customer < ApplicationRecord
  has_one_attached :thumbnail
  has_many :properties, dependent: :destroy
  has_many :inspections, through: :properties
end
