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

  # Añade imágenes a un objeto PDF, organizándolas en una cuadrícula.
  def self.add_images_to_pdf(pdf_object, images, images_per_page: 20)
    # 1. Agrupamos las imágenes en lotes (En este caso 20)
    images.each_slice(images_per_page) do |image_batch|
      # 2. Creamos una nueva página de PDF en memoria para cada lote de imágenes.
      image_page_data = Prawn::Document.new(page_size: 'LETTER', margin: 30) do |pdf|
        # --- Lógica de la Cuadrícula ---
        num_columns = 4
        num_rows = 5 # 4 columnas * 5 filas = 20 imágenes

        # Calculamos el espacio disponible y el tamaño de cada celda para la imagen.
        padding = 5 # Espacio entre imágenes
        available_width = pdf.bounds.width
        available_height = pdf.bounds.height

        cell_width = (available_width - (padding * (num_columns - 1))) / num_columns
        cell_height = (available_height - (padding * (num_rows - 1))) / num_rows

        # 3. Iteramos sobre el lote actual de imágenes y las colocamos en la cuadrícula.
        image_batch.each_with_index do |image, index|
          image_data = image.download
          sio = StringIO.new(image_data)

          # Calculamos la fila y columna para la imagen actual.
          row = index / num_columns
          col = index % num_columns

          # Calculamos la posición (x, y) de la esquina superior izquierda de la celda.
          # El origen de Prawn (0,0) está en la esquina inferior izquierda.
          x = col * (cell_width + padding)
          y = pdf.bounds.top - (row * (cell_height + padding))

          # Dibujamos la imagen dentro del cuadro delimitador de la celda.
          pdf.bounding_box([x, y], width: cell_width, height: cell_height) do
            pdf.image(sio, fit: [pdf.bounds.width, pdf.bounds.height], position: :center, vposition: :center)
          end
        rescue StandardError => e
          Rails.logger.error "No se pudo procesar la imagen #{image.filename}: #{e.message}"
          next # Si una imagen falla, continuamos con la siguiente.
        end
      end.render # Renderizamos la página de Prawn a datos de PDF en memoria.

      # 4. Unimos la página recién creada (con su cuadrícula de imágenes) al PDF principal.
      pdf_object << CombinePDF.parse(image_page_data)
    end

    pdf_object
  end
end
