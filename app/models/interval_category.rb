class IntervalCategory < ApplicationRecord
  has_and_belongs_to_many :form_templates
  has_many :next_inspections

  validates :name, presence: true, uniqueness: true
end
