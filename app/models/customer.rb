class Customer < ApplicationRecord
  has_one_attached :thumbnail
  has_many :properties, dependent: :destroy
  has_many :inspections, through: :properties

  has_many :customer_emails, dependent: :destroy
  accepts_nested_attributes_for :customer_emails, allow_destroy: true, reject_if: :all_blank

  scope :search_by_name, ->(query) { where("name ILIKE ?", "%#{query}%") }

  def email
    # Check for the primary email or the first available email in the new association first
    primary_email = customer_emails.find_by(primary: true)
    new_email = primary_email&.address || customer_emails.first&.address
    return new_email if new_email.present?

    # Ultimate fallback to the legacy column
    super
  end
end
