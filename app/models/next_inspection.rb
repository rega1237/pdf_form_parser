class NextInspection < ApplicationRecord
  belongs_to :property
  belongs_to :system_category
  belongs_to :interval_category
end
