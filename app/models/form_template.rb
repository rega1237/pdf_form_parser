class FormTemplate < ApplicationRecord
  has_many :form_fills, dependent: :destroy
  has_many :form_submissions, dependent: :destroy

  # We can add validations here later, e.g.:
  # validates :name, presence: true
  # validates :original_filename, presence: true
  # validates :file_path, presence: true
  # validates :file_type, presence: true
  # validates :form_structure, presence: true
end
