class FormFill < ApplicationRecord
  belongs_to :form_template
  has_many :inspections, dependent: :destroy
end
