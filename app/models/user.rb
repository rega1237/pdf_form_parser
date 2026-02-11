class User < ApplicationRecord
  has_one_attached :avatar
  belongs_to :role, optional: true
  has_many :inspections
  # Include default devise modules. Others available are:
  # :confirmable, :lockable, :timeoutable, :trackable and :omniauthable
  devise :database_authenticatable, :recoverable, :rememberable, :validatable

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
