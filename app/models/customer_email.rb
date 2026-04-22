class CustomerEmail < ApplicationRecord
  belongs_to :customer

  validates :address, presence: true, format: { with: URI::MailTo::EMAIL_REGEXP }
end
