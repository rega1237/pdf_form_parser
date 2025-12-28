require 'json'

def update_json_sections(json_path, new_section_names)
  # Read the JSON file
  unless File.exist?(json_path)
    puts "Error: File not found at #{json_path}"
    return
  end

  json_content = File.read(json_path)
  if json_content.strip.empty?
    puts "Error: The file #{json_path} is empty."
    return
  end

  begin
    data = JSON.parse(json_content)
  rescue JSON::ParserError => e
    puts "Error: Failed to parse JSON file #{json_path}. Invalid JSON format."
    puts "Details: #{e.message}"
    return
  end

  # Create a mapping from section number to the new section name
  # We assume the section number is the unique identifier (e.g., "1.1", "1.2")
  # Format expected: "Prefix | Number Title (Ref)"
  section_map = {}

  new_section_names.each do |new_name|
    # Regex to extract the number part: looks for "| " followed by digits/dots followed by a space
    if match = new_name.match(/\|\s*(\d+(\.\d+)*)\s/)
      number = match[1]
      section_map[number] = new_name
    else
      puts "Warning: Could not extract section number from '#{new_name}'"
    end
  end

  puts "Loaded #{section_map.size} new section names mapping."

  updated_count = 0

  # Iterate through the JSON data and update section_name
  data.each do |item|
    next unless item['section_name'] && !item['section_name'].empty?

    current_name = item['section_name']

    # Extract number from current name
    next unless match = current_name.match(/\|\s*(\d+(\.\d+)*)\s/)

    number = match[1]

    next unless section_map.key?(number)

    new_name = section_map[number]
    if current_name != new_name
      item['section_name'] = new_name
      updated_count += 1
    end
  end

  # Write the updated JSON back to file
  File.write(json_path, JSON.pretty_generate(data))
  puts "Successfully updated #{updated_count} items in #{json_path}"
end

# Configuration
json_file_path = '/Users/rafaelguzman/Desktop/proyectos/pdf_form_parser/scripts/pre_action.json'

# Add all your new section names here
new_sections_array = [
  'Quarterly Inspection (I) | 1.1 Control Valves - Identification Sign (nfpa 25 ref: 13.3.1)',
  'Quarterly Inspection (I) | 1.1 Control Valves - Identification Sign (nfpa 25 ref: 13.3.2)',
  'Quarterly Inspection (I) | 1.3 Waterflow Alarm Devices (nfpa 25 ref: 5.2.5)',
  'Quarterly Inspection (I) | 1.4 Supervisory Alarm Devices (nfpa 25 ref: 5.2.5)',
  'Quarterly Inspection (I) | 1.5 Gauges (Pre-Action Valves) (nfpa 25 ref: 13.4.3.1.3)',
  'Quarterly Inspection (I) | 1.6 Air Pressure (nfpa 25 ref: 13.4.3.1.4)',
  'Quarterly Inspection (I) | 1.7 Water Supply Pressure (nfpa 25 ref: 13.4.3.1.3.1)',
  'Quarterly Inspection (I) | 1.8 Detection System (Pilot Line) Air Pressure (nfpa 25 ref: 13.4.3.1.5)',
  'Quarterly Inspection (I) | 1.9 Hydraulic Desing Information Sign (nfpa 25 ref: 5.2.6)',
  'Quarterly Inspection (I) | 1.10 General Information Sign (nfpa 25 ref: 5.2.8)',
  'Quarterly Inspection (I) | 1.11 Heat tape (nfpa 25 ref: 5.2.7)',
  'Quarterly Inspection (I) | 1.12 Spare Sprinklers (nfpa 25 ref: 5.2.1.4)',
  'Quarterly Inspection (I) | 1.13 Fire Department Connections (nfpa 25 ref: 13.7)',
  'Quarterly Inspection (I) | 1.14 Pre-action Valves - Exterior Inspection (nfpa 25 ref: 13.4.3.1.6)',
  'Quarterly Inspection (I) | 1.15 Pressure Reducing Valves (nfpa 25 ref: 13.5.1)',
  'Quarterly Inspection (I) | 1.16 Master Pressure reducing Valves (nfpa 25 ref: 13.5.4.1)',
  'Quarterly Inspection | 1.17 Backflow Preventers (nfpa 25 ref: 13.6.1)',
  'Annual Inspection (I) | 1.18 Low Temperature Alarms (nfpa 25 ref: 13.4.3.1.2)',
  'Annual Inspection (I) | 1.19 Sprinklers (nfpa 25 ref: 5.2.1)',
  'Annual Inspection (I) | 1.20 Pipe and Fittings (nfpa 25 ref: 5.2.2)',
  'Annual Inspection (I) | 1.21 Hangers (nfpa 25 ref: 5.2.3)',
  'Annual Inspection (I) | 1.22 Seismic Braces (nfpa 25 ref: 5.2.3)',
  'Annual Inspection (I) | 1.23 Building (Freeze Protection) (nfpa 25 ref: 4.1.1)',
  'Annual Inspection (I) | 1.24 Low Temperature Alarm Test (nfpa 25 ref: 13.4.3.1.2)',
  'Annual Inspection (T) | 2.1 Field Service Test Required (nfpa 25 ref: 5.3.1)',
  'Annual Inspection (T) | 2.2 Recalled Sprinklers (nfpa 25 ref: Title 19, 904.1 (c))',
  'Annual Inspection (T) | 2.3 Waterflow Alarm Devices 90 sec. maximum (nfpa 25 ref: 5.3.3, 13.2.6)',
  'Annual Inspection (T) | 2.4 Main Drain Test (Enter Data on Page 1 of this form) (nfpa 25 ref: 13.2.5, 13.3.3.4)',
  'Annual Inspection (T) | 2.5 Priming Water Level Test (nfpa 25 ref: 13.4.3.2.1)',
  'Annual Inspection (T) | 2.6 Pre-Action Valve Trip Test (nfpa 25 ref: 13.4.3.2.3, 13.4.3.2.4, 13.4.3.2.5)',
  'Annual Inspection (T) | 2.7 Valve Trip Time (nfpa 25 ref: 13.4.3.2.12)',
  'Annual Inspection (T) | 2.8 Manual Actuation Device Test (nfpa 25 ref: 13.4.3.2.9)',
  'Annual Inspection (T) | 2.9 Low Air Pressure Alarm Test (nfpa 25 ref: 13.4.3.2.13)',
  'Annual Inspection (T) | 2.10 Low Temperature alarm Test (nfpa 25 ref: 13.4.3.2.14)',
  'Annual Inspection (T) | 2.11 Automatic Air Pressure Maintenance Device Test (nfpa 25 ref: 13.4.3.2.15)',
  'Annual Inspection (T) | 2.12 Control Valve - Operation (nfpa 25 ref: 13.3.3)',
  'Annual Inspection (T) | 2.13 Valve Supervisory Devices (nfpa 25 ref: 13.3.3.5)',
  'Annual Inspection (T) | 2.14 Backflow Preventer Assemblies (nfpa 25 ref: 13.6.2)',
  'Annual Inspection (T) | 2.15 PRV - PRV - Partial Flow (nfpa 25 ref: 13.5.1.3)',
  'Annual Inspection (M) | 3.1 Control Valves (nfpa 25 ref: 13.3.4)',
  'Annual Inspection (M) | 3.2 Air Leaks repaired (nfpa 25 ref: 13.4.3.3.1)',
  'Annual Inspection (M) | 3.3 Pre-Action Valve Interior Inspected and Cleaned (nfpa 25 ref: 13.4.3.1.7, 13.4.3.3.2)',
  'Annual Inspection (M) | 3.4 Low Points in System Drained (nfpa 25 ref: 13.4.3.3.3)',
  'Annual Inspection (M) | 3.5 Additional Manufacturers Maintenance Requirements Satisfied (nfpa 25 ref: 13.4.3.3.4)',
  'Annual Inspection (M) | 3.6 Obstruction Investigation Required (nfpa 25 ref: 14.3)',
  'Annual Inspection (M) | 3.7 System Returned to Service (nfpa 25 ref: 4.5.3, 13.4.3.2.10, 15.7)'

  # Add the rest of the strings here...
]

# Run the update
update_json_sections(json_file_path, new_sections_array)
