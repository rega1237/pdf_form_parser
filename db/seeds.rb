# Crear categorías de intervalo si no existen
interval_categories = [
  ["Quarterly Inspection", 3],
  ["Annual Inspection", 12],
  ["5-Year Inspection", 60]
]

interval_categories.each do |interval|
  IntervalCategory.find_or_create_by(name: interval[0], duration_in_months: interval[1])
end

puts "Categorías de intervalo creadas exitosamente"

# Crear rol de Admin si no existe
admin_role = Role.find_or_create_by(level: "Admin")

# Crear usuario administrador si no existe
admin_user = User.find_or_create_by(email: "rega1237@gmail.com") do |user|
  user.password = "rega1237"
  user.password_confirmation = "rega1237"
  user.role = admin_role
  user.name = "Admin User"
end

puts "Usuario administrador creado: #{admin_user.email}" if admin_user.persisted?

# Crear categorías de sistema si no existen
system_categories = [
  "Wet Pipe Fire Sprinkler System",
  "Fire Pump",
  "Dry Pipe Fire Sprinkler System",
  "Stand Pipe",
  "Water Tank",
  "Foam",
  "Water Spray",
  "Private Fire Service Main"
]

system_categories.each do |name|
  system_category = SystemCategory.find_or_create_by(name: name)
  
  # Adjuntar imagen si no tiene una ya
  unless system_category.thumbnail.attached?
    # Convertir el nombre a formato de archivo (espacios por guiones bajos, minúsculas)
    image_filename = "#{name.gsub(' ', '_')}.png"
    image_path = Rails.root.join("app", "assets", "images", "system_category", image_filename)
    
    if File.exist?(image_path)
      system_category.thumbnail.attach(
        io: File.open(image_path),
        filename: image_filename,
        content_type: "image/png"
      )
      puts "Imagen adjuntada para #{name}: #{image_filename}"
    else
      puts "Advertencia: No se encontró la imagen #{image_filename} para #{name}"
    end
  end
end

puts "Categorías de sistema creadas exitosamente"

# Crear deficiencias si no existen
deficiencies = [
  "Missing",
  "Rusty",
  "Leaking",
  "Damaged",
  "No sound",
  "Not Connected",
  "Not Installed",
  "Not Reading",
  "Not Required",
  "Not Readable",
  "Wrong Temperature",
  "Missing Caps or Plugs",
  "Not Visable",
  "Not Installed Correctly",
  "Not Certified",
  "Faulty",
  "Extensive Mic",
  "Painted",
  "Outdated (50+ Yrs)",
  "Installed Incorrectly",
  "Not Accessible",
  "Not Functioning",
  "Corossion",
  "Low Pressure",
  "Unable to Test"
]

deficiencies.each do |name|
  Deficiency.find_or_create_by(name: name)
end

puts "Deficiencias creadas exitosamente"
