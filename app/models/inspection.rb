class Inspection < ApplicationRecord
  belongs_to :property
  belongs_to :form_template
  has_one :form_fill, dependent: :destroy

  # Delegamos el acceso al customer a través de property
  delegate :customer, to: :property

  validates :date, presence: true
  validates :property_id, presence: true

  scope :by_customer, ->(customer) { joins(:property).where(properties: { customer_id: customer.id }) }
  scope :by_date_range, ->(start_date, end_date) { where(date: start_date..end_date) }
  scope :recent, -> { order(date: :desc) }

  def customer_name
    property.customer.name
  end

  def property_address
    property.address
  end
end
