class LicenseInfo < ApplicationRecord
  validates :license_number, presence: true
end
