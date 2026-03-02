require 'json'

file_path = '/Users/rafaelguzman/Desktop/proyectos/pdf_form_parser/z.json'
data = JSON.parse(File.read(file_path))

data.each do |field|
  if field['type'] == 'Date'
    field['required'] = false
  elsif field['type'] == 'Radio'
    field['required'] = true
    field['column_width'] = '9'
  end
end

File.write(file_path, JSON.pretty_generate(data))
puts "z.json updated successfully."
