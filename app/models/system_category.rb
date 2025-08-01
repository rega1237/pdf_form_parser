class SystemCategory < ApplicationRecord
  has_one_attached :thumbnail
  has_many :next_inspections
end
