class Role < ApplicationRecord
  has_many :users
  validates :level, presence: true, uniqueness: true
end
