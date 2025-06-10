class FormFill < ApplicationRecord
  belongs_to :form_template
  belongs_to :inspection, optional: true
  has_one_attached :filled_pdf
  # validates :inspection_id, presence: true, if: :inspection_id_present?
  
  # Método para obtener la URL del archivo PDF rellenado
  def pdf_url
    if filled_pdf.attached?
      Rails.application.routes.url_helpers.rails_blob_path(filled_pdf, only_path: true)
    end
  end
end
