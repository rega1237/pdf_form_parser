class Inspection < ApplicationRecord
  belongs_to :property
  belongs_to :form_template
  belongs_to :user
  has_many :form_fills, dependent: :destroy

  # Delegamos el acceso al customer a través de property
  delegate :customer, to: :property

  validates :date, presence: true
  validates :property_id, presence: true

  scope :by_customer, ->(customer) { joins(:property).where(properties: { customer_id: customer.id }) }
  scope :by_date_range, ->(start_date, end_date) { where(date: start_date..end_date) }
  scope :recent, -> { order(date: :desc) }

  after_update :trigger_deficiency_transfer, if: -> { saved_change_to_status? && status == "completed" }

  def customer_name
    property.customer.name
  end

  def property_address
    property.address
  end

  private

  def trigger_deficiency_transfer
    TransferDeficienciesJob.perform_later(id)
  end
end
