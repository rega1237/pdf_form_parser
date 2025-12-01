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

  def self.add_images_to_pdf(pdf_object, photos_with_context, title:)
    # photos_with_context is an array of hashes:
    # [{ photo: attachment, section_name: "Section A | Item 1", label_name: "Label 1" }, ...]

    # Reject signatures if they accidentally get passed in.
    photos_with_context = Array(photos_with_context).reject do |h|
      fname = h[:photo]&.filename.to_s.downcase
      fname.include?('_signature_') || fname.start_with?('signature_') || fname.include?('firma')
    end

    return pdf_object if photos_with_context.empty?

    # Group photos by the main section part (before '|')
    grouped_photos = photos_with_context.group_by do |h|
      (h[:section_name].presence || 'Uncategorized Photos').split('|').first.strip
    end

    all_photos_pdf_data = Prawn::Document.new(page_size: 'LETTER', margin: 30) do |pdf|
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

          pdf.bounding_box([0, pdf.cursor], width: pdf.bounds.width, height: cell_height) do
            row_of_photos.each_with_index do |photo_data, col_index|
              image_blob_data = photo_data[:photo].download
              sio = StringIO.new(image_blob_data)
              x_position = col_index * (cell_width + padding)

              pdf.bounding_box([x_position, pdf.bounds.top], width: cell_width, height: cell_height - label_height) do
                pdf.image(sio, fit: [pdf.bounds.width, pdf.bounds.height], position: :center, vposition: :center)
              end

              # Correct caption logic: use part after '|' from section_name, or fallback.
              section_parts = (photo_data[:section_name] || '').split('|')
              caption = if section_parts.length > 1
                          section_parts[1].strip
                        else
                          photo_data[:label_name].presence || photo_data[:photo].filename.base.to_s
                        end

              pdf.bounding_box([x_position, pdf.bounds.top - (cell_height - label_height)], width: cell_width,
                                                                                            height: label_height) do
                pdf.text caption.capitalize, size: 7, align: :center, valign: :center, overflow: :shrink_to_fit
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

  # Append client signature images as standalone annex pages.
  # Accepts ActiveStorage attachments (or any object responding to `download` and `filename`).
  # Ensures image quality by rendering at full page fit while preserving aspect ratio.
  def self.add_signature_annexes(pdf_object, signature_images)
    images = Array(signature_images).compact
    return pdf_object if images.empty?

    # Opción B: texto + imagen de la firma del cliente incrustada en la página.
    # - Eliminar el título "imagen de la firma del cliente".
    # - Incrustar la imagen de la firma centrada, ajustada al ancho disponible.
    # - Mostrar la etiqueta inferior en inglés: "Client signature".
    annex_pdf_data = Prawn::Document.new(page_size: 'LETTER', margin: 36) do |pdf|
      images.each_with_index do |image, idx|
        pdf.start_new_page if idx > 0

        begin
          # Descargar el blob de la imagen desde ActiveStorage (o equivalente)
          data = image.respond_to?(:download) ? image.download : image
          sio = StringIO.new(data)

          # Ajustar la imagen al ancho disponible y altura razonable, manteniendo proporción.
          # Reducimos el tamaño (ej. 30%) y reservamos el espacio de la imagen para que
          # el texto quede SIEMPRE debajo.
          scale_ratio = 0.3 # 30% del área disponible; ajustable si necesitas otro tamaño
          label_height = 20
          max_width = pdf.bounds.width * scale_ratio
          # Cajón compacto: igualar alto del cajón al ancho máximo para acercar el texto
          image_box_height = max_width

          pdf.bounding_box([0, pdf.cursor], width: pdf.bounds.width, height: image_box_height) do
            pdf.image(sio, fit: [max_width, image_box_height], position: :center, vposition: :bottom)
          end
        rescue StandardError => e
          Rails.logger.error("No se pudo incrustar la imagen de firma en el anexo: #{e.message}")
          # En caso de error, aún mostramos la etiqueta para no perder contexto
        end

        pdf.move_down 4
        pdf.text 'Client signature', size: 12, align: :center
      end
    end.render

    pdf_object << CombinePDF.parse(annex_pdf_data)
    pdf_object
  end
end
