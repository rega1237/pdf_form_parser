require "combine_pdf"
require "prawn"
require "stringio"

class PdfMergingService
  def initialize(main_pdf_path, deficiencies_pdf_path = nil)
    @main_pdf_path = main_pdf_path
    @deficiencies_pdf_path = deficiencies_pdf_path
  end

  def merge
    main_pdf = CombinePDF.load(@main_pdf_path)
    if @deficiencies_pdf_path
      deficiencies_pdf = CombinePDF.load(@deficiencies_pdf_path)
      main_pdf << deficiencies_pdf
    end
    main_pdf
  end

  def self.add_images_to_pdf(pdf_object, photos_with_context, title:)
    # photos_with_context is an array of hashes:
    # [{ photo: attachment, section_name: "Section A | Item 1", label_name: "Label 1" }, ...]

    # Reject signatures if they accidentally get passed in.
    photos_with_context = Array(photos_with_context).reject do |h|
      fname = h[:photo]&.filename.to_s.downcase
      fname.include?("_signature_") || fname.start_with?("signature_") || fname.include?("firma")
    end

    return pdf_object if photos_with_context.empty?

    # Group photos by the main section part (before '|')
    grouped_photos = photos_with_context.group_by do |h|
      (h[:section_name].presence || "Uncategorized Photos").split("|").first.strip
    end

    all_photos_pdf_data = Prawn::Document.new(page_size: "LETTER", margin: 30) do |pdf|
      # 1. Use the dynamic title.
      pdf.text title, size: 18, style: :bold, align: :center
      pdf.move_down 25

      grouped_photos.each_with_index do |(main_section, photos_in_section), section_index|
        # Asegurarse de que haya espacio para el título de la sección, si no, empezar en una nueva página.
        pdf.start_new_page if pdf.cursor < 50

        pdf.move_down 20 if section_index > 0

        # 2. Agregar el titulo Section".
        pdf.text "Section: #{main_section}", size: 14, style: :bold, align: :left
        pdf.stroke_horizontal_rule
        pdf.move_down 10

        # --- Lógica de la Cuadrícula ---
        num_columns = 4
        padding = 10
        label_height = 15
        cell_width = (pdf.bounds.width - (padding * (num_columns - 1))) / num_columns
        cell_height = cell_width + label_height

        photos_in_section.each_slice(num_columns) do |row_of_photos|
          # Controlar el salto de página si la fila no cabe.
          pdf.start_new_page if pdf.cursor < cell_height

          pdf.bounding_box([ 0, pdf.cursor ], width: pdf.bounds.width, height: cell_height) do
            row_of_photos.each_with_index do |photo_data, col_index|
              image_blob_data = photo_data[:photo].download
              sio = StringIO.new(image_blob_data)
              x_position = col_index * (cell_width + padding)

              pdf.bounding_box([ x_position, pdf.bounds.top ], width: cell_width, height: cell_height - label_height) do
                pdf.image(sio, fit: [ pdf.bounds.width, pdf.bounds.height ], position: :center, vposition: :center)
              end

              # Correct caption logic: use part after '|' from section_name, or fallback.
              section_parts = (photo_data[:section_name] || "").split("|")
              caption = if section_parts.length > 1
                          section_parts[1].strip
              else
                          photo_data[:label_name].presence || photo_data[:photo].filename.base.to_s
              end

              pdf.bounding_box([ x_position, pdf.bounds.top - (cell_height - label_height) ], width: cell_width,
                                                                                            height: label_height) do
                pdf.text caption.upcase, size: 7, align: :center, valign: :center, overflow: :shrink_to_fit
              end
            rescue StandardError => e
              Rails.logger.error "No se pudo procesar la imagen #{photo_data[:photo].filename}: #{e.message}"
              next
            end
          end
          pdf.move_down padding
        end
      end
    end.render

    pdf_object << CombinePDF.parse(all_photos_pdf_data)
    pdf_object
  end

  # Append client signature images as standalone annex pages with a structured report layout.
  def self.add_signature_annexes(pdf_object, signature_images, inspection)
    images = Array(signature_images).compact
    return pdf_object if images.empty?

    # Fetch Data
    contractor = ContractorInfo.first
    license = LicenseInfo.first

    inspection_date = inspection.date&.strftime("%m/%d/%Y") || ""
    property_address = inspection.property&.address || ""
    contractor_name = contractor&.name || ""
    license_number = license&.license_number || ""
    contractor_address = contractor&.address || ""
    customer_name = inspection.property&.customer&.name || ""
    logo_path = Rails.root.join("app/assets/images/firemex_logo.png")

    annex_pdf_data = Prawn::Document.new(page_size: "LETTER", margin: 30) do |pdf|
      images.each_with_index do |image, idx|
        pdf.start_new_page if idx > 0

        # --- Top Section ---
        # Draw a box around the header info
        top_box_height = 200
        pdf.bounding_box([ 0, pdf.cursor ], width: pdf.bounds.width, height: top_box_height) do
          pdf.stroke_bounds

          pdf.pad(10) do
            pdf.indent(10) do
              pdf.text "Report of Inspection / Test", size: 16, style: :bold
            end
          end

          pdf.stroke_horizontal_rule

          # 3 Columns
          y_start = pdf.cursor - 10
          col_width = pdf.bounds.width / 3.0

          # Col 1: Date & Property
          pdf.bounding_box([ 10, y_start ], width: col_width - 10, height: 140) do
            pdf.text "Date", style: :bold, size: 10
            pdf.text inspection_date, size: 10
            pdf.move_down 10
            pdf.text "Property", style: :bold, size: 10
            pdf.text property_address, size: 10
          end

          # Col 2: Contractor Info
          pdf.bounding_box([ 10 + col_width, y_start ], width: col_width, height: 140) do
            pdf.text "Inspection conducted by:", size: 10
            pdf.move_down 10
            pdf.text contractor_name, size: 10
            pdf.text "C16-#{license_number}", size: 10
            pdf.text contractor_address, size: 10
            pdf.text "itm@firemexsolutions.com", size: 10
          end

          # Col 3: Logo
          pdf.bounding_box([ 10 + (col_width * 2), y_start ], width: col_width - 20, height: 100) do
            pdf.image logo_path, fit: [ col_width - 20, 80 ], position: :right if File.exist?(logo_path)
          end
        end

        # --- Middle Section (Grey Bar) ---
        pdf.fill_color "E0E0E0"
        pdf.fill_rectangle([ 0, pdf.cursor ], pdf.bounds.width, 25)

        # Add border
        pdf.stroke_color "000000"
        pdf.stroke_rectangle([ 0, pdf.cursor ], pdf.bounds.width, 25)

        pdf.fill_color "000000"

        pdf.text_box "Customers Signature", at: [ 10, pdf.cursor - 7 ], size: 10, style: :bold
        pdf.move_down 25

        # --- Bottom Section (Signature Table) ---
        # 3 Columns: Customer Name | Signature | Date
        # Widths: First two larger than third.
        # Total width ~ 552.
        # Let's try: 180, 272, 100

        table_height = 120
        y_table_start = pdf.cursor

        # We'll use bounding boxes with borders to simulate the table for better control over the image

        # Col 1: Customer Name
        pdf.bounding_box([ 0, y_table_start ], width: 180, height: table_height) do
          pdf.stroke_bounds
          pdf.indent(5) do
            pdf.move_down 5
            pdf.text "Customer Name", size: 9, style: :bold
            pdf.move_down 20
            pdf.text customer_name, size: 11
          end
        end

        # Col 2: Signature
        pdf.bounding_box([ 180, y_table_start ], width: 272, height: table_height) do
          pdf.stroke_bounds
          pdf.indent(5) do
            pdf.move_down 5
            pdf.text "Signature", size: 9, style: :bold
          end

          # Insert Signature Image
          begin
            data = image.respond_to?(:download) ? image.download : image
            sio = StringIO.new(data)

            # Image box inside the cell
            pdf.bounding_box([ 5, table_height - 20 ], width: 262, height: table_height - 30) do
              pdf.image sio, fit: [ 262, table_height - 30 ], position: :center, vposition: :center
            end
          rescue StandardError => e
            Rails.logger.error("No se pudo incrustar la imagen de firma en el anexo: #{e.message}")
          end
        end

        # Col 3: Date
        pdf.bounding_box([ 180 + 272, y_table_start ], width: 100, height: table_height) do
          pdf.stroke_bounds
          pdf.indent(5) do
            pdf.move_down 5
            pdf.text "Date", size: 9, style: :bold
            pdf.move_down 20
            pdf.text inspection_date, size: 11
          end
        end
      end
    end.render

    pdf_object << CombinePDF.parse(annex_pdf_data)
    pdf_object
  end
end
