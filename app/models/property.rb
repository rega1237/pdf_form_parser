class Property < ApplicationRecord
  belongs_to :customer
  has_many :inspections, dependent: :destroy
end
