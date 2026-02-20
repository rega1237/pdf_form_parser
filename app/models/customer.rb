class Customer < ApplicationRecord
  has_one_attached :thumbnail
  has_many :properties, dependent: :destroy
  has_many :inspections, through: :properties

  has_many :customer_emails, dependent: :destroy
  accepts_nested_attributes_for :customer_emails, allow_destroy: true, reject_if: :all_blank

  scope :search_by_name, ->(query) { where("name ILIKE ?", "%#{query}%") }

  def email
    return super if super.present?

    # Fallback to the primary email or the first available email if primary is not set
    primary_email = customer_emails.find_by(primary: true)
    primary_email&.address || customer_emails.first&.address
  end
end
