class User < ApplicationRecord
  has_one_attached :avatar
  belongs_to :role, optional: true
  has_many :inspections
  # Include default devise modules. Others available are:
  # :confirmable, :lockable, :timeoutable, :trackable and :omniauthable
  devise :database_authenticatable, :recoverable, :rememberable, :validatable

  scope :active, -> { where(is_active: true) }
  scope :inactive, -> { where(is_active: false) }

  def active_for_authentication?
    super && is_active
  end

  def inactive_message
    is_active ? super : :inactive
  end

  def deactivate!
    update_column(:is_active, false)
  end

  def activate!
    update_column(:is_active, true)
  end

  def display_name
    name.present? ? name : email
  end

  def admin?
    role&.level == "Admin"
  end

  def developer?
    role&.level == "Developer"
  end

  def technician?
    role&.level == "Technician"
  end
end
