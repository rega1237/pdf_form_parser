class FormTemplate < ApplicationRecord
  has_many :form_fills, dependent: :destroy
  has_one_attached :original_file
  has_and_belongs_to_many :interval_categories

  # validates :name, presence: true
  # validates :file_type, presence: true
  # validates :form_structure, presence: true

  before_update :update_associated_form_fills, if: :form_structure_changed?

  # Agregamos validación para el archivo adjunto
  validates :original_file, presence: true
  
  # Método para obtener la URL del archivo
  def file_path
    if original_file.attached?
      Rails.application.routes.url_helpers.rails_blob_path(original_file, only_path: true)
    end
  end

  private


  def update_associated_form_fills
    form_fills.each do |form_fill|
      form_fill.update(form_structure: form_structure)
    end
  end
end
