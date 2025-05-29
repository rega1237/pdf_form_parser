# app/services/pdf_forms_parser_service.rb
require 'pdf-forms'
require 'pdf-reader' # Add this line

class PdfFormsParserService
  def initialize(file_path)
    @pdftk = PdfForms.new # Assumes pdftk is in PATH, or specify path
    @file_path = file_path
  end

  def parse
    raw_fields = @pdftk.get_fields(@file_path)
    
    # Initialize PDF::Reader to extract text for labels
    reader = PDF::Reader.new(@file_path)

    form_structure = raw_fields.map do |field|
      human_label = find_label_for_field_from_pdf(field, reader, @pdftk, @file_path)
      {
        name: field.name,
        type: field.type, # e.g., "Text", "Button", "Choice"
        value: field.value,
        options: field.options, # For 'Choice' type
        human_label: human_label.presence || field.name&.humanize # Fallback to humanized name
      }
    end
    form_structure
  rescue PdfForms::PdftkError => e
    Rails.logger.error "PdftkError while parsing #{@file_path}: #{e.message}"
    [] # Return empty array or handle error as appropriate
  rescue PDF::Reader::MalformedPDFError => e
    Rails.logger.error "MalformedPDFError while reading #{@file_path}: #{e.message}"
    # Fallback to parsing without labels if reader fails
    raw_fields.map do |field|
      {
        name: field.name,
        type: field.type,
        value: field.value,
        options: field.options,
        human_label: field.name&.humanize # Fallback
      }
    end
  end

  private

# Constants for proximity logic (these may need tuning)
  MAX_X_DISTANCE_LEFT = 150 # Max horizontal distance for a label to the left (in PDF points)
  Y_ALIGNMENT_TOLERANCE = 10  # Max vertical distance for text to be considered aligned (in PDF points)

  def find_label_for_field_from_pdf(field_obj, pdf_reader, _pdftk_instance, _pdf_path)
    field_name_to_find = field_obj.name
    best_candidate_label = nil

    pdf_reader.pages.each_with_index do |page, _page_num|
      # 1. Find the form field annotation on this page
      field_annotation = page.annotations&.find do |annot|
        # Form fields are Widget annotations. Their names are often in /T or /TU keys.
        # The field_obj.name from pdf-forms might match one of these.
        annot[:Subtype] == :Widget && 
        (annot[:T]&.value == field_name_to_find || annot[:TU]&.value == field_name_to_find)
      end

      next unless field_annotation && field_annotation[:Rect]

      field_rect = field_annotation[:Rect] # [x0, y0, x1, y1]
      field_x0 = field_rect[0]
      field_y0 = field_rect[1]
      # field_y_mid = (field_rect[1] + field_rect[3]) / 2.0 # Mid Y-coordinate of the field

      # 2. Iterate through text runs on the same page to find a nearby label
      # We are looking for text to the LEFT of the field, reasonably aligned vertically.
      page.text_runs.each do |text_run|
        text_x1 = text_run.x + text_run.width # Right edge of the text_run
        text_y0 = text_run.y # Bottom edge of the text_run (pdf-reader y is usually baseline)
        # text_y_mid = text_run.y + (text_run.height / 2.0) # Approximate mid Y of text

        # Proximity check:
        # - Is the text to the left of the field?
        # - Is it horizontally close enough?
        # - Is it vertically aligned (enough)?
        is_to_left = text_x1 < field_x0
        horizontal_distance = field_x0 - text_x1
        is_horizontally_close = horizontal_distance > 0 && horizontal_distance < MAX_X_DISTANCE_LEFT
        
        # Y-alignment: check if the text_run's baseline (y) is close to the field's bottom (y0)
        # This is a simple check; more sophisticated checks might compare mid-points or overlap.
        is_vertically_aligned = (text_y0 - field_y0).abs < Y_ALIGNMENT_TOLERANCE

        if is_to_left && is_horizontally_close && is_vertically_aligned
          # This text_run is a candidate. Is it better than a previous one?
          # "Better" could mean closer, or you might take the first one found.
          # For now, let's take the closest one found so far.
          if best_candidate_label.nil? || horizontal_distance < best_candidate_label[:distance]
            best_candidate_label = { text: text_run.text.strip, distance: horizontal_distance }
          end
        end
      end
      
      # If we found a label on this page for this field, we can stop searching for this field.
      # (Assuming a field name is unique within the PDF)
      break if best_candidate_label 
    end

    best_candidate_label ? best_candidate_label[:text] : nil
  rescue => e
    Rails.logger.error "Error in find_label_for_field_from_pdf for field '#{field_obj.name}': #{e.message}\n#{e.backtrace.join("\n")}"
    nil # Return nil if any error occurs
  end
end