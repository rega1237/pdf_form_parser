require 'combine_pdf'

class PdfMergingService
  # El servicio se inicializa con las rutas a los dos archivos PDF que queremos unir.
  def initialize(main_pdf_path, deficiencies_pdf_path)
    @main_pdf_path = main_pdf_path
    @deficiencies_pdf_path = deficiencies_pdf_path
  end

  # El método `merge` carga ambos PDFs, los combina y devuelve un nuevo objeto PDF combinado.
  def merge
    # Cargamos el PDF principal
    main_pdf = CombinePDF.load(@main_pdf_path)
    # Cargamos el PDF de deficiencias
    deficiencies_pdf = CombinePDF.load(@deficiencies_pdf_path)

    # Añadimos todas las páginas del PDF de deficiencias al final del PDF principal
    main_pdf << deficiencies_pdf

    # Devolvemos el objeto PDF combinado
    main_pdf
  end
end
