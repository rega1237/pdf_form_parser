class IntervalCategory < ApplicationRecord
  has_and_belongs_to_many :form_templates

  validates :name, presence: true, uniqueness: true

  # Método para obtener la duración efectiva, infiriendo del nombre si no está explícita en BD
  def effective_duration
    return duration_in_months if duration_in_months.present?

    case name.to_s.downcase
    when /weekly/ then 0
    when /monthly/ then 1
    when /quarterly/ then 3
    when /semi-annual/, /semi annual/ then 6
    when /annual/, /yearly/ then 12
    when /3 year/ then 36
    when /5 year/ then 60
    when /10 year/ then 120
    else nil
    end
  end
end
