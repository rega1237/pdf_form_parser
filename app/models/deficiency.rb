# frozen_string_literal: true

class Deficiency < ApplicationRecord
  validates :name, presence: true, uniqueness: { case_sensitive: false }
end
