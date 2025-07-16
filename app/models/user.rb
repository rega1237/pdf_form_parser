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
end
