require 'json'
require 'optparse'

def normalize_spaces(value)
  value.to_s.gsub(/\s+/, ' ').strip
end

def split_label_and_section(label_name)
  raw = label_name.to_s
  parts = raw.split('|').map { |p| p.to_s.strip }.reject(&:empty?)
  return [ raw.to_s.strip, nil ] if parts.size < 2

  if parts.size >= 3 && parts[-3..].map { |p| p.to_s.strip.upcase } == [ 'P', 'F', 'N/A' ]
    section_parts = parts[0..-4]
    section = section_parts.empty? ? nil : section_parts.join(' | ')
    return [ 'P | F | N/A', section ]
  end

  [ parts.last, parts[0..-2].join(' | ') ]
end

def pass_fail_label?(label_name)
  normalized = normalize_spaces(label_name)
  normalized.casecmp('P | F | N/A').zero?
end

def pass_label?(label_name)
  normalized = normalize_spaces(label_name)
  normalized.casecmp('pass').zero? || normalized.casecmp('p').zero?
end

def parse_riser_row(section_name)
  return nil if section_name.nil?

  match = section_name.to_s.match(/\ARiser Information\s*\|\s*Riser row\s*(\d+)\s*\z/i)
  match ? match[1].to_i : nil
end

def parse_inspection_pair(section_name)
  return nil if section_name.nil?

  parts = section_name.to_s.split('|').map { |p| p.to_s.strip }
  number_part = parts.find { |p| p.match?(/\A\d+\.\d+/) }
  return nil unless number_part

  match = number_part.match(/\A(\d+)\.(\d+)/)
  return nil unless match

  [ match[1].to_i, match[2].to_i ]
end

def header_section_rank(section_name)
  order = [ 'Property Information', 'License', 'Contractor or Licensed Owner Information' ]
  idx = order.index(section_name)
  idx.nil? ? nil : idx
end

def section_sort_key(section_name, first_seen_index)
  header_rank = header_section_rank(section_name)
  return [ 0, header_rank ] if header_rank

  riser_row = parse_riser_row(section_name)
  return [ 1, riser_row ] if riser_row

  return [ 2, 0 ] if section_name.to_s.strip == 'Riser Information | Footer  Risers'

  inspection_pair = parse_inspection_pair(section_name)
  return [ 3, inspection_pair[0], inspection_pair[1] ] if inspection_pair

  [ 4, first_seen_index.fetch(section_name, 1_000_000), section_name.to_s ]
end

def label_rank_property(label)
  order = [ 'Building Name', 'Property Address', 'Property City', 'Property Contact Person', 'Property Phone' ]
  idx = order.index(label)
  idx.nil? ? [ 1, label ] : [ 0, idx ]
end

def label_rank_license(label)
  order = [ 'License #', 'SFM', 'CSLB' ]
  idx = order.index(label)
  idx.nil? ? [ 1, label ] : [ 0, idx ]
end

def label_rank_contractor(label)
  order = {
    'Contractor Name' => 0,
    'Contractor Address' => 1,
    'Constractor Address' => 1,
    'Contractor City' => 2,
    'Contractor State' => 3,
    'Contractor Zip' => 4,
    'Contractor zip' => 4,
    'Contractor Phone' => 5,
    'Job #' => 6,
    'Misc' => 7
  }
  idx = order[label]
  idx.nil? ? [ 1, label ] : [ 0, idx ]
end

def label_rank_inspection(label)
  return [ 0, 0 ] if label.casecmp('date').zero?
  return [ 2, 0 ] if pass_fail_label?(label)
  return [ 3, 0 ] if label.casecmp('pass photo').zero?
  return [ 4, 0 ] if label.casecmp('deficiency').zero?
  return [ 5, 0 ] if label.casecmp('photo').zero?

  [ 1, label ]
end

def label_rank_riser(label)
  return [ 3, 0 ] if label.casecmp('pass photo').zero?
  return [ 4, 0 ] if label.casecmp('deficiency').zero?
  return [ 5, 0 ] if label.casecmp('photo').zero?

  base = label.gsub(/\s+\d+\z/, '').strip
  order = {
    'Riser No.' => 0,
    'Riser Location' => 1,
    'Riser Diameter' => 2,
    'Riser Drain Diameter' => 3,
    'Initial Static Pressure' => 4,
    'Residual Pressure' => 5,
    'Final Static Pressure' => 6,
    'P | F | N/A' => 7
  }
  rank = order[base] || order[label]
  rank.nil? ? [ 1, base, label ] : [ 0, rank ]
end

def label_rank_for_section(section_name, label_name)
  label = normalize_spaces(label_name)

  return label_rank_property(label) if section_name == 'Property Information'
  return label_rank_license(label) if section_name == 'License'
  return label_rank_contractor(label) if section_name == 'Contractor or Licensed Owner Information'
  return label_rank_riser(label) if parse_riser_row(section_name)
  return label_rank_inspection(label) if parse_inspection_pair(section_name)

  [ 0, label ]
end

def build_pass_bundle_key(pass_fail_field)
  id = pass_fail_field['id'].to_s
  if (match = id.match(/\Apass_(\d+)_(\d+)\z/i))
    return "#{match[1]}_#{match[2]}"
  end

  if (match = id.match(/\AriserPassFail_(\d+)\z/i))
    return "riser_#{match[1]}"
  end

  sanitized = id.gsub(/\s+/, '_').gsub(/[^A-Za-z0-9_]/, '')
  sanitized.empty? ? 'unknown' : sanitized
end

def bundle_after?(fields, idx, bundle)
  expected = [ bundle[:pass_photo_id], bundle[:deficiency_id], bundle[:deficiency_photo_id] ]
  next_three = fields[(idx + 1)..(idx + 3)] || []
  next_three_ids = next_three.map { |f| f['id'].to_s }
  expected.all? { |id| next_three_ids.include?(id) }
end

def build_basic_field(attributes)
  {
    'id' => attributes.fetch(:id),
    'name' => attributes.fetch(:name),
    'original_name' => attributes.fetch(:original_name),
    'type' => attributes.fetch(:type),
    'value' => '',
    'human_label' => attributes.fetch(:human_label),
    'label_name' => attributes.fetch(:label_name),
    'section_name' => attributes.fetch(:section_name),
    'page_number' => '',
    'column_width' => attributes.fetch(:column_width),
    'required' => attributes.fetch(:required)
  }.merge(attributes.fetch(:extra, {}))
end

def build_pass_photo_field(bundle_key, section_name)
  id = "pass_photo_#{bundle_key}"
  build_basic_field(
    id: id,
    name: id,
    original_name: id,
    type: 'pass_photo',
    human_label: id,
    label_name: 'Pass Photo',
    section_name: section_name,
    column_width: '9',
    required: false,
    extra: { 'photo_attachment_id' => nil }
  )
end

def build_deficiency_field(bundle_key, section_name)
  id = "Deficiency Field_#{bundle_key}"
  build_basic_field(
    id: id,
    name: id,
    original_name: id,
    type: 'Deficiency',
    human_label: id,
    label_name: 'Deficiency',
    section_name: section_name,
    column_width: '9',
    required: false,
    extra: {
      'options' => %w[Minor Major Critical],
      'comment_value' => '',
      'Item' => '',
      'Riser' => '',
      'D' => '',
      'C' => '',
      'select' => ''
    }
  )
end

def build_deficiency_photo_field(bundle_key, section_name)
  id = "Deficiency Photo_#{bundle_key}"
  build_basic_field(
    id: id,
    name: id,
    original_name: id,
    type: 'Photo',
    human_label: id,
    label_name: 'Photo',
    section_name: section_name,
    column_width: '9',
    required: false,
    extra: { 'photo_attachment_id' => nil }
  )
end

def normalize_label_and_section!(field)
  label, section = split_label_and_section(field['label_name'])
  field['label_name'] = label
  field['section_name'] = section if section
end

def normalize_pass_fail_field!(field)
  field['label_name'] = 'P | F | N/A' if pass_label?(field['label_name'])
  return unless pass_fail_label?(field['label_name'])

  field['type'] = 'Pass/Fail'
  field['required'] = true
end

def normalize_date_field!(field)
  return unless normalize_spaces(field['label_name']).casecmp('date').zero?
  return unless field['type'].to_s == 'Text'

  field['type'] = 'Date'
end

def build_inspection_section_map(fields)
  map = {}
  fields.each do |field|
    pair = parse_inspection_pair(field['section_name'])
    map[pair] ||= field['section_name'] if pair
  end
  map
end

def apply_pass_section_name!(field, inspection_section_by_pair)
  id = field['id'].to_s
  match = id.match(/\Apass_(\d+)_(\d+)\z/i)
  return unless match

  pair = [ match[1].to_i, match[2].to_i ]
  section = inspection_section_by_pair[pair]
  return unless section

  field['section_name'] = section
  field['label_name'] = 'P | F | N/A'
  field['type'] = 'Pass/Fail'
  field['required'] = true
  field['column_width'] = '9'
end

def normalize_fields!(fields)
  fields.each do |field|
    normalize_label_and_section!(field)
    normalize_pass_fail_field!(field)
    normalize_date_field!(field)
  end

  inspection_section_by_pair = build_inspection_section_map(fields)
  fields.each { |field| apply_pass_section_name!(field, inspection_section_by_pair) }
end

def order_fields(fields)
  first_seen = {}
  original_index = {}.compare_by_identity
  fields.each_with_index do |field, idx|
    section = field['section_name'].to_s
    first_seen[section] ||= idx
    original_index[field] = idx
  end

  grouped = fields.group_by { |f| f['section_name'].to_s }

  ordered_sections = grouped.keys.sort_by { |section| section_sort_key(section, first_seen) }
  ordered = []

  ordered_sections.each do |section|
    section_fields = grouped[section]
    section_fields_sorted = section_fields.sort_by do |f|
      [ label_rank_for_section(section, f['label_name']), original_index.fetch(f, 1_000_000) ]
    end
    ordered.concat(section_fields_sorted)
  end

  ordered
end

def bundle_ids_for(bundle_key)
  {
    pass_photo_id: "pass_photo_#{bundle_key}",
    deficiency_id: "Deficiency Field_#{bundle_key}",
    deficiency_photo_id: "Deficiency Photo_#{bundle_key}"
  }
end

def append_bundle_fields(output, bundle_key, section_name)
  output << build_pass_photo_field(bundle_key, section_name)
  output << build_deficiency_field(bundle_key, section_name)
  output << build_deficiency_photo_field(bundle_key, section_name)
end

def insert_pass_bundles(fields)
  output = []

  fields.each_with_index do |field, idx|
    output << field
    next unless field['type'].to_s == 'Pass/Fail'

    bundle_key = build_pass_bundle_key(field)
    bundle = bundle_ids_for(bundle_key)
    next if bundle_after?(fields, idx, bundle)

    append_bundle_fields(output, bundle_key, field['section_name'].to_s)
  end

  output
end

def generated_deficiency_photo?(field)
  field['id'].to_s.start_with?('Deficiency Photo_') && field['type'].to_s == 'Photo'
end

def section_sort_sections(fields)
  first_seen = {}
  fields.each_with_index do |field, idx|
    section = field['section_name'].to_s
    first_seen[section] ||= idx
  end
  grouped = fields.group_by { |f| f['section_name'].to_s }
  ordered_sections = grouped.keys.sort_by { |section| section_sort_key(section, first_seen) }
  [ grouped, ordered_sections ]
end

def paginate_fields!(fields)
  grouped, ordered_sections = section_sort_sections(fields)

  current_page = 1

  ordered_sections.each do |section|
    section_fields = grouped[section]
    base_page = current_page
    has_pass_fail = section_fields.any? { |f| f['type'].to_s == 'Pass/Fail' }

    section_fields.each do |f|
      is_deficiency = f['type'].to_s == 'Deficiency'
      is_deficiency_photo = generated_deficiency_photo?(f)
      target_page = is_deficiency || is_deficiency_photo ? (base_page + 1) : base_page
      f['page_number'] = target_page.to_s
    end

    current_page += has_pass_fail ? 2 : 1
  end
end

options = {
  input: nil,
  output: nil,
  in_place: false
}

OptionParser.new do |opts|
  opts.on('-i', '--input PATH') { |v| options[:input] = v }
  opts.on('-o', '--output PATH') { |v| options[:output] = v }
  opts.on('--in-place') { options[:in_place] = true }
end.parse!

input_path = options[:input] || File.join(__dir__, 'pre_action_5_years.json')
raise "File not found: #{input_path}" unless File.exist?(input_path)

raw = File.read(input_path)
parsed = JSON.parse(raw)
raise 'Expected a JSON array at the root' unless parsed.is_a?(Array)

fields = parsed
normalize_fields!(fields)
ordered = order_fields(fields)
with_bundles = insert_pass_bundles(ordered)
paginate_fields!(with_bundles)

output_path = if options[:in_place]
                input_path
else
                options[:output] || input_path.sub(/\.json\z/i, '.updated.json')
end

File.write(output_path, JSON.pretty_generate(with_bundles))
puts "Wrote #{with_bundles.size} fields to #{output_path}"
