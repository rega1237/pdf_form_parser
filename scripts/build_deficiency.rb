require 'json'

DEFAULT_INPUT_PATH = '/Users/rafaelguzman/Desktop/proyectos/pdf_form_parser/scripts/def.json'

input_path = ARGV[0].to_s.strip
input_path = DEFAULT_INPUT_PATH if input_path.empty?

output_path = ARGV[1].to_s.strip
output_path = input_path if output_path.empty?

unless File.exist?(input_path)
  warn "Error: File not found at #{input_path}"
  exit 1
end

raw = File.read(input_path)
if raw.strip.empty?
  warn "Error: The file #{input_path} is empty."
  exit 1
end

begin
  data = JSON.parse(raw)
rescue JSON::ParserError => e
  warn "Error: Failed to parse JSON file #{input_path}. Invalid JSON format."
  warn "Details: #{e.message}"
  exit 1
end

unless data.is_a?(Array)
  warn "Error: Expected top-level JSON array in #{input_path}"
  exit 1
end

updated = 0
skipped = 0

data.each do |item|
  unless item.is_a?(Hash)
    skipped += 1
    next
  end

  label = item['label_name'].to_s
  number = label.scan(/\d+/).last

  if number.nil? || number.strip.empty?
    skipped += 1
    next
  end

  new_section = "def_#{number}"
  if item['section_name'] != new_section
    item['section_name'] = new_section
    updated += 1
  end
end

File.write(output_path, JSON.pretty_generate(data))
puts "Updated section_name for #{updated} items (skipped #{skipped})."
puts "Wrote: #{output_path}"
