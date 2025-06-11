class IntervalCategory < ApplicationRecord
  has_and_belongs_to_many :form_templates
  
  validates :name, presence: true, uniqueness: true
end