require 'combine_pdf'
require 'prawn'
require 'stringio'

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

  def self.add_images_to_pdf(pdf_object, images)
    # This method works with the new data structure by receiving photo attachments directly
    # Photo attachment IDs are now stored in the data column, but this service doesn't need
    # to access them - it works with the actual photo attachments passed as parameter
    # IMPORTANT: Excluir imágenes de firma (special-case) para evitar duplicarlas en páginas normales.
    images = Array(images).reject { |img| img&.filename.to_s.include?('_signature_') || img&.filename.to_s.start_with?('signature_') }
    grouped_photos = group_and_process_photos(images)
    return pdf_object if grouped_photos.empty?

    all_photos_pdf_data = Prawn::Document.new(page_size: 'LETTER', margin: 30) do |pdf|
      # 1. Añadir el título principal al comienzo.
      pdf.text 'Deficiency with photos', size: 18, style: :bold, align: :center
      pdf.move_down 25

      grouped_photos.each_with_index do |(section_name, photos_in_section), section_index|
        # Asegurarse de que haya espacio para el título de la sección, si no, empezar en una nueva página.
        pdf.start_new_page if pdf.cursor < 50

        pdf.move_down 20 if section_index > 0

        # 2. Agregar el titulo Section".
        pdf.text "Section: #{section_name}", size: 14, style: :bold, align: :left
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

          pdf.bounding_box([0, pdf.cursor], width: pdf.bounds.width, height: cell_height) do
            row_of_photos.each_with_index do |photo_data, col_index|
              image_blob_data = photo_data[:image].download
              sio = StringIO.new(image_blob_data)
              x_position = col_index * (cell_width + padding)

              pdf.bounding_box([x_position, pdf.bounds.top], width: cell_width, height: cell_height - label_height) do
                pdf.image(sio, fit: [pdf.bounds.width, pdf.bounds.height], position: :center, vposition: :center)
              end

              pdf.bounding_box([x_position, pdf.bounds.top - (cell_height - label_height)], width: cell_width,
                                                                                            height: label_height) do
                pdf.text photo_data[:clean_name], size: 7, align: :center, valign: :center, overflow: :shrink_to_fit
              end
            rescue StandardError => e
              Rails.logger.error "No se pudo procesar la imagen #{photo_data[:image].filename}: #{e.message}"
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

  # Método auxiliar para la lógica de agrupación.
  # This method works with the new data structure by parsing photo filenames
  # which contain the section information needed for grouping
  def self.group_and_process_photos(images)
    grouped = {}

    # Ensure images is an array-like object
    return grouped unless images.respond_to?(:each)

    images.each do |image|
      # Skip invalid images
      next unless image&.filename&.base

      filename = image.filename.base.to_s
      match = filename.match(/^inspection_\d+_(.+)__(.+)_[a-f0-9]{8,}/)

      if match
        section_raw = match[1]
        name_raw = match[2]

        section_name = section_raw.gsub('_', ' ').strip.capitalize
        clean_name = name_raw.gsub('_', ' ').strip.sub(/(\d) (\d)/, '\1.\2')

        (grouped[section_name] ||= []) << { image: image, clean_name: clean_name.capitalize }
      else
        (grouped['Uncategorized Photos'] ||= []) << { image: image, clean_name: image.filename.base.to_s }
      end
    end

    grouped
  end
end
