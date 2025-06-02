class FormTemplate < ApplicationRecord
  has_many :form_fills, dependent: :destroy
  has_many :form_submissions, dependent: :destroy

  # Add validations here later, e.g.:
  # validates :name, presence: true
  # validates :file_type, presence: true
  # validates :form_structure, presence: true

  before_update :update_associated_form_fills, if: :form_structure_changed?
  before_destroy :delete_file_from_google_drive

  private

  def delete_file_from_google_drive
    return unless google_drive_file_id.present?

    GoogleDriveService.new.delete_file(google_drive_file_id)
  end

  def update_associated_form_fills
    form_fills.each do |form_fill|
      form_fill.update(form_structure: form_structure)
    end
  end
end
