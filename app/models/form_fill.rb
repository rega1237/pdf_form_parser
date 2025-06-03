class FormFill < ApplicationRecord
  belongs_to :form_template
  belongs_to :inspection, optional: true
  # validates :inspection_id, presence: true, if: :inspection_id_present?
end
