class FormTemplate < ApplicationRecord
  has_many :form_fills, dependent: :destroy
  has_one_attached :original_file

  # Add validations here later, e.g.:
  # validates :name, presence: true
  # validates :file_type, presence: true
  # validates :form_structure, presence: true

  before_update :update_associated_form_fills, if: :form_structure_changed?
  # Eliminamos el callback de Google Drive
  # before_destroy :delete_file_from_google_drive

  # Agregamos validación para el archivo adjunto
  validates :original_file, presence: true
  
  # Método para obtener la URL del archivo
  def file_path
    if original_file.attached?
      Rails.application.routes.url_helpers.rails_blob_path(original_file, only_path: true)
    end
  end

  private

  # Eliminamos el método de Google Drive
  # def delete_file_from_google_drive
  #   return unless google_drive_file_id.present?
  #   GoogleDriveService.new.delete_file(google_drive_file_id)
  # end

  def update_associated_form_fills
    form_fills.each do |form_fill|
      form_fill.update(form_structure: form_structure)
    end
  end
end
