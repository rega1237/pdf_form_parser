class Customer < ApplicationRecord
  has_one_attached :thumbnail
  has_many :properties, dependent: :destroy
end
