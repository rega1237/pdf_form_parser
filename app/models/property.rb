class Property < ApplicationRecord
  belongs_to :customer
  has_many :inspections, dependent: :destroy
  has_many :next_inspections, dependent: :destroy
end
