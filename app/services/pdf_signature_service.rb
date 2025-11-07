# frozen_string_literal: true

# PdfSignatureService
# - Detecta campos de firma (/FT /Sig) y su estado (firmado/no firmado)
# - Lee metadatos de firmas (nombre del firmante, fecha, razón, ubicación, subfilter)
# - Firma programáticamente un campo de firma utilizando un certificado (P12/PEM+KEY)
#
# Nota:
# - Usa HexaPDF para trabajar con firmas digitales. Mantiene compatibilidad con pdf-forms
#   que seguirá manejando campos AcroForm normales (texto, checkbox, etc.).
# - La firma se hace sobre un PDF ya rellenado (si procede), para mantener la compatibilidad
#   con el flujo actual de PdfFormsParserService.

require 'hexapdf'
require 'hexapdf/image_loader'

class PdfSignatureService
  SignatureInfo = Struct.new(
    :name,
    :signing_time,
    :reason,
    :location,
    :contact_info,
    :sub_filter,
    keyword_init: true
  )

  # Lista los campos de firma y su estado.
  # Devuelve un array de hashes con:
  # { name:, is_signed:, info: SignatureInfo or nil }
  def self.list_signature_fields(file_path)
    doc = HexaPDF::Document.open(file_path)
    return [] unless doc.acro_form

    fields = []
    doc.acro_form.each_field do |field|
      next unless signature_field?(field)

      info = extract_signature_info(field)
      field_name = extract_field_name(field)
      fields << {
        name: field_name,
        is_signed: !info.nil?,
        info: info
      }
    end
    fields
  rescue StandardError => e
    Rails.logger.warn "HexaPDF signature read failed on #{file_path}: #{e.message}"
    []
  end

  # Obtiene info de una firma específica por nombre de campo.
  def self.signature_info(file_path, field_name)
    doc = HexaPDF::Document.open(file_path)
    return nil unless doc.acro_form

    field = doc.acro_form.field_by_name(field_name)
    return nil unless field && signature_field?(field)

    extract_signature_info(field)
  rescue StandardError => e
    Rails.logger.warn "HexaPDF signature info failed on #{file_path}##{field_name}: #{e.message}"
    nil
  end

  # Firma el PDF en el campo de firma indicado.
  # Soporta:
  # - certificado P12 (certificate_path + certificate_password)
  # - certificado PEM y clave PEM (certificate_path + key_path)
  # Opciones adicionales: reason, location, contact_info, name
  # Devuelve output_path si todo va bien.
  def self.sign(file_path, output_path, field_name, certificate_path:, certificate_password: nil, key_path: nil, reason: nil, location: nil, contact_info: nil, name: nil, signature_image_path: nil)
    # Intento con API Ruby de HexaPDF; si falla, fallback al CLI.
    begin
      doc = HexaPDF::Document.open(file_path)
      raise "Campo de firma no encontrado: #{field_name}" unless doc.acro_form&.field_by_name(field_name)

      signer = build_signer(certificate_path, certificate_password, key_path)

      appearance = if signature_image_path && File.exist?(signature_image_path)
                      {
                        type: :image,
                        image: signature_image_path
                      }
                    else
                      {
                        type: :text, # apariencia simple compatible con Adobe
                        text: build_appearance_text(name: name, reason: reason, location: location)
                      }
                    end

      doc.sign(
        output_path,
        signer: signer,
        signature_field: field_name,
        reason: reason,
        location: location,
        contact_info: contact_info,
        name: name,
        sub_filter: 'adbe.pkcs7.detached', # PAdES básico compatible con Adobe
        appearance: appearance
      )

      return output_path
    rescue StandardError => e
      Rails.logger.warn "Ruby API sign failed, trying CLI: #{e.message}"
      sign_with_cli(
        file_path,
        output_path,
        field_name,
        certificate_path: certificate_path,
        certificate_password: certificate_password,
        key_path: key_path,
        reason: reason,
        location: location,
        contact_info: contact_info,
        name: name,
        signature_image_path: signature_image_path
      )
    end
  end

  # -----------------
  # Helpers
  # -----------------
  def self.signature_field?(field)
    (field.respond_to?(:field_type) && field.field_type == :Sig) ||
      field.type == :Sig rescue false
  end

  def self.extract_signature_info(field)
    v = field.dict[:V]
    return nil unless v.is_a?(HexaPDF::Dictionary)

    SignatureInfo.new(
      name: v[:Name],
      signing_time: v[:M],
      reason: v[:Reason],
      location: v[:Location],
      contact_info: v[:ContactInfo],
      sub_filter: v[:SubFilter]
    )
  rescue StandardError => _e
    nil
  end

  # Intenta obtener el nombre completo del campo de forma robusta entre versiones
  def self.extract_field_name(field)
    if field.respond_to?(:fully_qualified_name)
      field.fully_qualified_name
    elsif field.respond_to?(:full_name)
      field.full_name
    elsif field.respond_to?(:name)
      field.name
    else
      # Último recurso: usar la clave de diccionario /T (Partial Field Name)
      field[:T]
    end
  rescue
    field[:T]
  end

  def self.build_signer(certificate_path, certificate_password, key_path)
    if File.extname(certificate_path).downcase == '.p12' || File.extname(certificate_path).downcase == '.pfx'
      HexaPDF::DigitalSignature::Signer.for_pkcs12(certificate_path, certificate_password)
    else
      raise 'Se requiere key_path para certificado PEM' unless key_path
      HexaPDF::DigitalSignature::Signer.for_certificate_and_key(certificate_path, key_path)
    end
  end

  def self.build_appearance_text(name:, reason:, location:)
    parts = []
    parts << "Firmado por: #{name}" if name
    parts << "Razón: #{reason}" if reason
    parts << "Ubicación: #{location}" if location
    parts.empty? ? 'Documento firmado' : parts.join("\n")
  end

  def self.sign_with_cli(file_path, output_path, field_name, certificate_path:, certificate_password:, key_path:, reason:, location:, contact_info:, name:, signature_image_path: nil)
    cmd = %w[bundle exec hexapdf sign]
    cmd += [file_path, output_path, '--field', field_name]
    if File.extname(certificate_path).downcase == '.p12' || File.extname(certificate_path).downcase == '.pfx'
      cmd += ['--certificate', certificate_path]
      cmd += ['--password', certificate_password.to_s] if certificate_password
    else
      cmd += ['--certificate', certificate_path, '--key', key_path.to_s]
    end
    cmd += ['--reason', reason.to_s] if reason
    cmd += ['--location', location.to_s] if location
    cmd += ['--contact-info', contact_info.to_s] if contact_info
    cmd += ['--name', name.to_s] if name
    # HexaPDF CLI podría no soportar imagen directamente para apariencia.
    # Si se requiere imagen y el CLI no lo soporta, se mantendrá apariencia por defecto.

    success = system(*cmd)
    raise "Fallo al firmar vía CLI (hexapdf)" unless success
    output_path
  end

  # Estampa una imagen (firma manuscrita) sobre el área del campo de firma sin usar certificado.
  # - file_path: PDF origen
  # - output_path: PDF destino
  # - field_name: nombre del campo (/T) donde se ubicará la firma
  # - image_path: ruta del PNG/JPG con la firma manuscrita
  # - scale_to_fit: si true, mantiene proporciones dentro del rectángulo
  # - margin: margen interno dentro del rectángulo del widget
  def self.stamp_signature_image(file_path, output_path, field_name, image_path, scale_to_fit: true, margin: 0, allow_upscale: false)
    raise "Imagen de firma no encontrada: #{image_path}" unless image_path && File.exist?(image_path)

    doc = HexaPDF::Document.open(file_path)
    raise 'El documento no tiene AcroForm' unless doc.acro_form

    field = doc.acro_form.field_by_name(field_name)
    raise "Campo de firma no encontrado: #{field_name}" unless field

    # Obtener el widget (cuadro visible) del campo de forma robusta
    # Preferimos usar `each_widget` (API recomendada) y hacemos fallback a
    # `widget_annotations` cuando sea necesario.
    widget = nil
    begin
      if field.respond_to?(:each_widget)
        # Intento directo (casos habituales)
        field.each_widget do |w|
          widget = w
          break if widget
        end

        # Fallback para casos en los que el widget esté embebido/no directo
        if widget.nil?
          field.each_widget(direct_only: false) do |w|
            widget = w
            break if widget
          end
        end
      end

      # Último recurso: API antigua
      if widget.nil? && field.respond_to?(:widget_annotations)
        widget = field.widget_annotations&.first
      end
    rescue StandardError
      widget = nil
    end
    raise "Widget del campo no encontrado para: #{field_name}" unless widget

    # Localizar la página del widget recorriendo las páginas y sus anotaciones
    page = nil
    doc.pages.each do |p|
      begin
        p.each_annotation do |annot|
          if annot == widget
            page = p
            break
          end
        end
      rescue StandardError
        # continuar si alguna página tiene anotaciones inválidas
      end
      break if page
    end
    raise "Página del widget no disponible para: #{field_name}" unless page

    rect = widget[:Rect]
    raise "Rect del widget no disponible para: #{field_name}" unless rect

    # HexaPDF devuelve normalmente un HexaPDF::Rectangle; admitir también Array por compatibilidad
    coords = if rect.respond_to?(:value)
               rect.value
             elsif rect.is_a?(Array)
               rect
             else
               nil
             end
    raise "Rect del widget no disponible para: #{field_name}" unless coords && coords.size == 4

    llx, lly, urx, ury = coords
    width  = (urx - llx).abs
    height = (ury - lly).abs
    inner_width  = [width - 2 * margin, 0].max
    inner_height = [height - 2 * margin, 0].max

    # Cargar la imagen con la API pública de HexaPDF
    image = doc.images.add(image_path)

    # Usar un stream de overlay para páginas con contenido existente
    canvas = page.canvas(type: :overlay)
    # Dibujar la imagen dentro del rectángulo del widget
    if scale_to_fit
      # Mantener proporción dentro del área
      img_w = image.width
      img_h = image.height
      scale = [inner_width / img_w.to_f, inner_height / img_h.to_f].min
      # Para evitar borrosidad, no reescalar hacia arriba salvo que se indique
      scale = [scale, 1.0].min unless allow_upscale
      draw_w = (img_w * scale)
      draw_h = (img_h * scale)
      # Centrar dentro del área
      x = llx + margin + (inner_width - draw_w) / 2.0
      y = lly + margin + (inner_height - draw_h) / 2.0
      canvas.image(image, at: [x, y], width: draw_w, height: draw_h)
    else
      x = llx + margin
      y = lly + margin
      canvas.image(image, at: [x, y], width: inner_width, height: inner_height)
    end

    # Intento de escritura con validación. Si falla por validación de anotaciones
    # (por ejemplo, alguna anotación del PDF no tiene Rect), hacemos fallback
    # a escribir sin validar. Esto es seguro para nuestro caso porque solo
    # estamos dibujando contenido (imagen) en un overlay y no modificamos
    # estructuras de anotaciones.
    begin
      doc.write(output_path, optimize: true)
    rescue StandardError => write_error
      Rails.logger.warn "HexaPDF validation/write failed (#{write_error.message}); retrying without validation for #{File.basename(file_path)}##{field_name}"
      doc.write(output_path, optimize: true, validate: false)
    end
    Rails.logger.info "Firma colocada correctamente en campo '#{field_name}' (imagen: #{File.basename(image_path)})"
    output_path
  rescue StandardError => e
    Rails.logger.error "Error estampando imagen de firma en #{file_path}##{field_name}: #{e.message}"
    raise
  end
end