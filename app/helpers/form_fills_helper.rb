module FormFillsHelper
  # Este método recibe la colección de campos del formulario y devuelve
  # una lista limpia y ordenada de secciones para la navegación.
  def navigation_sections_for_form(form_fields)
    # Es una buena práctica manejar el caso de que no haya campos.
    return [] if form_fields.blank?

    # Excluimos las secciones que son solo para deficiencias o fotos.
    filtered_fields = form_fields.reject { |f| %w[Deficiency Photo Deficiency_field].include?(f["type"]) }

    # Agrupamos los campos por su nombre de sección.
    grouped_fields = filtered_fields.group_by { |f| f["section_name"] }

    # Creamos un nuevo hash con el nombre y el número de página mínimo para esa sección.
    sections = grouped_fields.map do |name, fields|
      { name: name.presence || "General", page: fields.map { |f| f["page_number"].to_i }.min }
    end

    # Nos aseguramos de que cada sección aparezca solo una vez y ordenamos por número de página.
    sections.uniq { |s| s[:name] }.sort_by { |s| s[:page] }
  end
end
