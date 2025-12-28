require 'json'
require 'optparse'

def extract_array_container(hash)
  %w[form_structure fields form_fields structure].each do |key|
    value = hash[key]
    return value if value.is_a?(Array)
  end
  nil
end

def parse_embedded_json_array(value, label)
  inner = JSON.parse(value)
  inner if inner.is_a?(Array)
rescue JSON::ParserError => e
  warn "Warning: failed to parse embedded JSON array for #{label}: #{e.message}"
  nil
end

def normalize_form_structure(parsed)
  return parsed if parsed.is_a?(Array)
  return [] unless parsed.is_a?(Hash)

  direct = extract_array_container(parsed)
  return direct if direct

  embedded = parsed['form_structure']
  return [] unless embedded.is_a?(String)

  parse_embedded_json_array(embedded, 'form_structure') || []
end

def parse_integer(value)
  return nil if value.nil?
  return value if value.is_a?(Integer)

  s = value.to_s.strip
  return nil if s.empty?

  Integer(s, 10)
rescue ArgumentError
  nil
end

def deficiency_field?(field)
  field['type'].to_s.strip.casecmp('Deficiency').zero?
end

def deficiency_photo_field_name?(field)
  name = field['name'] || field['id']
  return false if name.nil?

  name.to_s.strip.downcase.start_with?('deficiency photo')
end

def deficiency_photo_field?(field)
  return false unless field['type'].to_s.strip.casecmp('Photo').zero?

  deficiency_photo_field_name?(field)
end

def allowed_to_change_page?(field)
  deficiency_field?(field) || deficiency_photo_field?(field)
end

def requires_page_number?(field)
  field.key?('page_number')
end

def special_page_field?(field)
  deficiency_field?(field) || deficiency_photo_field?(field)
end

def blank_to_label(value)
  s = value.to_s
  return '(blank)' if s.strip.empty?

  s
end

def mode(values)
  counts = Hash.new(0)
  values.each { |v| counts[v] += 1 }
  return nil if counts.empty?

  counts.max_by { |k, v| [ v, -k ] }[0]
end

def collect_positive_integers(fields, key, skip_proc:)
  fields.filter_map do |field|
    next if skip_proc.call(field)

    value = parse_integer(field[key])
    next if value.nil? || value <= 0

    value
  end
end

def calculate_base_page(fields)
  fixed = collect_positive_integers(
    fields,
    'page_number',
    skip_proc: ->(f) { !requires_page_number?(f) || special_page_field?(f) }
  )
  mode(fixed) || mode(
    collect_positive_integers(
      fields,
      'page_number',
      skip_proc: ->(f) { !requires_page_number?(f) || special_page_field?(f) }
    )
  )
end

def calculate_base_section_number(fields)
  fixed = collect_positive_integers(fields, 'section_number', skip_proc: ->(f) { allowed_to_change_page?(f) })
  mode(fixed) || mode(collect_positive_integers(fields, 'section_number', skip_proc: ->(_f) { false }))
end

def section_stats(fields)
  pages = collect_positive_integers(fields, 'page_number', skip_proc: ->(_f) { false })
  section_numbers = collect_positive_integers(fields, 'section_number', skip_proc: ->(_f) { false })

  {
    total: fields.size,
    pages: pages.uniq.sort,
    section_numbers: section_numbers.uniq.sort,
    has_deficiency: fields.any? { |f| deficiency_field?(f) },
    has_deficiency_photo: fields.any? { |f| deficiency_photo_field?(f) }
  }
end

def check_deficiency_page_consistency!(section_name, section_fields, base_page, fix:, issues:, fixes:)
  deficiency_pages = collect_positive_integers(
    section_fields,
    'page_number',
    skip_proc: ->(f) { !requires_page_number?(f) || !deficiency_field?(f) }
  ).uniq

  deficiency_photo_pages = collect_positive_integers(
    section_fields,
    'page_number',
    skip_proc: ->(f) { !requires_page_number?(f) || !deficiency_photo_field?(f) }
  ).uniq

  combined = (deficiency_pages + deficiency_photo_pages).uniq
  return if combined.empty?

  if combined.size > 1
    issues << {
      section_name: section_name,
      kind: 'deficiency_pages_inconsistent',
      details: { deficiency_pages: deficiency_pages.sort, deficiency_photo_pages: deficiency_photo_pages.sort }
    }
  end

  return if base_page.nil?

  expected = base_page + 1
  combined.each do |page|
    next if page == expected

    issues << {
      section_name: section_name,
      kind: 'deficiency_page_mismatch',
      details: { page: page, expected: expected }
    }
  end

  return unless fix

  section_fields.each_with_index do |field, idx|
    next unless requires_page_number?(field)
    next unless special_page_field?(field)

    current = parse_integer(field['page_number'])
    next if current == expected

    old = field['page_number']
    field['page_number'] = expected.to_s
    fixes << {
      section_name: section_name,
      kind: 'deficiency_page_number',
      details: { index: idx, name: field['name'] || field['id'], from: old, to: field['page_number'] }
    }
  end
end

def check_header_pages(section_name, base_page, stats, header_sections, issues)
  return unless header_sections.include?(section_name)

  unique_pages = stats[:pages]
  return unless unique_pages.size > 1

  issues << {
    section_name: section_name,
    kind: 'header_multiple_pages',
    details: { base_page: base_page, pages: unique_pages }
  }
end

def check_regular_page_mismatches!(section_name, section_fields, base_page, fix:, issues:, fixes:)
  section_fields.each_with_index do |field, idx|
    next unless requires_page_number?(field)

    page = parse_integer(field['page_number'])
    if page.nil? || page <= 0
      issues << {
        section_name: section_name,
        kind: 'invalid_page_number',
        details: { index: idx, name: field['name'] || field['id'], page_number: field['page_number'] }
      }
      next
    end

    next if special_page_field?(field)
    next if page == base_page

    issues << {
      section_name: section_name,
      kind: 'page_mismatch',
      details: { index: idx, name: field['name'] || field['id'], page: page, expected: base_page }
    }

    next unless fix

    old = field['page_number']
    field['page_number'] = base_page.to_s
    fixes << {
      section_name: section_name,
      kind: 'page_number',
      details: { index: idx, name: field['name'] || field['id'], from: old, to: field['page_number'] }
    }
  end
end

def check_global_page_collisions(fields)
  pages = Hash.new { |h, k| h[k] = {} }

  fields.each do |field|
    next unless requires_page_number?(field)

    page = parse_integer(field['page_number'])
    next if page.nil? || page <= 0

    section = blank_to_label(field['section_name'])
    pages[page][section] = true
  end

  pages.filter_map do |page, sections_hash|
    sections = sections_hash.keys.sort
    next if sections.size <= 1

    { kind: 'page_collision', details: { page: page, sections: sections } }
  end
end

def reflow_pages_by_section_order!(fields, fix:, issues:, fixes:)
  return unless fix

  grouped = fields.group_by { |f| blank_to_label(f['section_name']) }
  section_meta = grouped.map do |section_name, section_fields|
    first_index = fields.index { |f| blank_to_label(f['section_name']) == section_name }
    base_page = calculate_base_page(section_fields)
    stats = section_stats(section_fields)
    has_special = stats[:has_deficiency] || stats[:has_deficiency_photo]
    {
      section_name: section_name,
      section_fields: section_fields,
      first_index: first_index || 0,
      base_page: base_page,
      has_special: has_special
    }
  end

  ordered = section_meta.sort_by { |m| m[:first_index] }
  start_page = ordered.first&.dig(:base_page) || 1

  current_page = start_page
  ordered.each do |meta|
    base = current_page
    special_page = base + 1

    meta[:section_fields].each do |field|
      next unless requires_page_number?(field)

      expected = special_page_field?(field) ? special_page : base
      current = parse_integer(field['page_number'])
      next if current == expected

      old = field['page_number']
      field['page_number'] = expected.to_s
      fixes << {
        section_name: meta[:section_name],
        kind: 'reflow_page_number',
        details: { name: field['name'] || field['id'], from: old, to: field['page_number'] }
      }
    end

    current_page += meta[:has_special] ? 2 : 1
  end
end

def check_section_number_mismatches!(section_name, section_fields, base_section_number, fix:, issues:, fixes:)
  return if base_section_number.nil?

  section_fields.each_with_index do |field, idx|
    next if allowed_to_change_page?(field)

    section_number = parse_integer(field['section_number'])
    next if section_number.nil? || section_number <= 0
    next if section_number == base_section_number

    issues << {
      section_name: section_name,
      kind: 'section_number_mismatch',
      details: { index: idx, name: field['name'] || field['id'], section_number: section_number,
                 expected: base_section_number }
    }

    next unless fix

    old = field['section_number']
    field['section_number'] = base_section_number.to_s
    fixes << {
      section_name: section_name,
      kind: 'section_number',
      details: { index: idx, name: field['name'] || field['id'], from: old, to: field['section_number'] }
    }
  end
end

def check_and_fix!(fields, header_sections:, fix: false)
  grouped = fields.group_by { |f| blank_to_label(f['section_name']) }

  issues = []
  fixes = []

  global_collisions = check_global_page_collisions(fields)
  if fix && global_collisions.any?
    reflow_pages_by_section_order!(fields, fix: true, issues: issues, fixes: fixes)
  else
    global_collisions.each do |collision|
      issues << {
        section_name: '(global)',
        kind: collision[:kind],
        details: collision[:details]
      }
    end
  end

  if fix
    global_collisions_after = check_global_page_collisions(fields)
    global_collisions_after.each do |collision|
      issues << {
        section_name: '(global)',
        kind: collision[:kind],
        details: collision[:details]
      }
    end
  end

  grouped = fields.group_by { |f| blank_to_label(f['section_name']) }

  grouped.each do |section_name, section_fields|
    section_requires_pages = section_fields.any? { |f| requires_page_number?(f) }
    base_page = calculate_base_page(section_fields)
    base_section_number = calculate_base_section_number(section_fields)
    stats = section_stats(section_fields)

    check_deficiency_page_consistency!(
      section_name,
      section_fields,
      base_page,
      fix: fix,
      issues: issues,
      fixes: fixes
    )

    if base_page.nil? && section_requires_pages
      issues << {
        section_name: section_name,
        kind: 'missing_base_page',
        details: stats
      }
      next
    end

    check_header_pages(section_name, base_page, stats, header_sections, issues)

    check_regular_page_mismatches!(
      section_name,
      section_fields,
      base_page,
      fix: fix,
      issues: issues,
      fixes: fixes
    )

    check_section_number_mismatches!(
      section_name,
      section_fields,
      base_section_number,
      fix: fix,
      issues: issues,
      fixes: fixes
    )
  end

  { issues: issues, fixes: fixes }
end

options = {
  input: nil,
  output: nil,
  fix: false,
  json: false,
  dry_run: false,
  header_sections: [ 'Building Information', 'License', 'Contractor Information' ]
}

parser = OptionParser.new do |opts|
  opts.banner = 'Usage: ruby scripts/check_form_pagination.rb --input PATH [--fix] [--dry-run] [--output PATH] [--json]'

  opts.on('--input PATH', 'JSON path') { |v| options[:input] = v }
  opts.on('--output PATH', 'Write output JSON to path (requires --fix)') { |v| options[:output] = v }
  opts.on('--fix', 'Apply safe fixes (page_number / section_number mismatches)') { options[:fix] = true }
  opts.on('--dry-run', 'Compute fixes but do not write output') { options[:dry_run] = true }
  opts.on('--json', 'Print report as JSON') { options[:json] = true }
end

begin
  parser.parse!(ARGV)
rescue OptionParser::InvalidOption => e
  warn e.message
  warn parser
  exit 1
end

if options[:input].nil? || options[:input].to_s.strip.empty?
  warn parser
  exit 1
end

unless File.exist?(options[:input])
  warn "Error: File not found at #{options[:input]}"
  exit 1
end

raw = File.read(options[:input])
if raw.strip.empty?
  warn "Error: The file #{options[:input]} is empty."
  exit 1
end

begin
  parsed = JSON.parse(raw)
rescue JSON::ParserError => e
  warn "Error: Failed to parse JSON file #{options[:input]}. Invalid JSON format."
  warn "Details: #{e.message}"
  exit 1
end

fields = normalize_form_structure(parsed)
unless fields.is_a?(Array)
  warn 'Error: Could not normalize input into an array.'
  exit 1
end

report = check_and_fix!(
  fields,
  header_sections: options[:header_sections],
  fix: options[:fix]
)

if options[:fix] && !options[:dry_run]
  output_path = options[:output] || options[:input]
  if parsed.is_a?(Array)
    File.write(output_path, JSON.pretty_generate(fields))
  elsif parsed.is_a?(Hash) && parsed['form_structure'].is_a?(String)
    parsed['form_structure'] = fields.to_json
    File.write(output_path, JSON.pretty_generate(parsed))
  elsif parsed.is_a?(Hash)
    if parsed['form_structure'].is_a?(Array)
      parsed['form_structure'] = fields
    elsif parsed['fields'].is_a?(Array)
      parsed['fields'] = fields
    elsif parsed['form_fields'].is_a?(Array)
      parsed['form_fields'] = fields
    elsif parsed['structure'].is_a?(Array)
      parsed['structure'] = fields
    else
      File.write(output_path, JSON.pretty_generate(fields))
      exit 0
    end
    File.write(output_path, JSON.pretty_generate(parsed))
  end
end

summary = {
  input: options[:input],
  total_fields: fields.size,
  issues_count: report[:issues].size,
  fixes_count: report[:fixes].size,
  fix_mode: options[:fix]
}

if options[:json]
  puts JSON.pretty_generate({ summary: summary, issues: report[:issues], fixes: report[:fixes] })
else
  puts "Input: #{summary[:input]}"
  puts "Fields: #{summary[:total_fields]}"
  puts "Issues: #{summary[:issues_count]}"
  puts "Fixes: #{summary[:fixes_count]}"
  puts "Fix mode: #{summary[:fix_mode]}"
  puts

  report[:issues].first(200).each do |issue|
    section = issue[:section_name]
    kind = issue[:kind]
    details = issue[:details]
    puts "[#{kind}] #{section} #{details.to_json}"
  end

  extra = report[:issues].size - 200
  puts "... (#{extra} more)" if extra.positive?
end
