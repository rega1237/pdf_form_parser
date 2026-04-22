class SystemCategory < ApplicationRecord
  validates :name, presence: true
  has_one_attached :thumbnail
end
