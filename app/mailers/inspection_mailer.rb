class InspectionMailer < ApplicationMailer
  def send_inspection_pdf(form_fill_id, recipient_email = nil, subject = nil, body = nil)
    @form_fill = FormFill.find(form_fill_id)
    @inspection = @form_fill.inspection
    @property = @inspection.property
    @customer = @property.customer
    @inspector = @inspection.user
    @company_name = "Firemex Solutions"
    @custom_body = body

    # Use provided email or fallback to customer email
    recipient = recipient_email.presence || @customer.email

    # Raise error if no recipient email available
    raise ArgumentError, "No recipient email available" if recipient.blank?

    # Generate dynamic subject line with inspection details
    final_subject = subject.presence || "Inspection Report for #{@property.property_name} - #{@inspection.date.strftime('%B %d, %Y')}"

    # Process inline images in custom body if present
    @custom_body = process_inline_images(body)

    # Attach PDF if available
    raise ArgumentError, "PDF not available for attachment" unless @form_fill.filled_pdf.attached?

    # Generate descriptive filename that includes property and inspection information
    filename = generate_pdf_filename(@property, @inspection)
    attachments[filename] = @form_fill.filled_pdf.download

    mail(
      to: recipient,
      subject: final_subject,
      from: "#{@company_name} <#{ENV.fetch('MAILER_FROM_EMAIL', 'noreply@example.com')}>"
    )
  end

  private

  def process_inline_images(html_content)
    return nil if html_content.blank?

    doc = Nokogiri::HTML::DocumentFragment.parse(html_content)

    # Process ActionText format (saved content)
    doc.css("action-text-attachment").each do |node|
      next unless node["sgid"]

      blob = GlobalID::Locator.locate_signed(node["sgid"])
      next unless blob.is_a?(ActiveStorage::Blob)

      replace_node_with_inline_image(doc, node, blob)
    end

    # Process Trix editor raw format (unsaved content from params)
    doc.css("figure[data-trix-attachment]").each do |node|
      next unless node["data-trix-attachment"]

      begin
        attachment_data = JSON.parse(node["data-trix-attachment"])
        sgid = attachment_data["sgid"]
        next unless sgid

        blob = GlobalID::Locator.locate_signed(sgid)
        next unless blob.is_a?(ActiveStorage::Blob)

        # Find the image tag within the figure
        img = node.at_css("img")
        
        if img
          # Attach the file inline and update src
          unique_filename = "#{blob.id}-#{blob.filename}"
          attachments.inline[unique_filename] = blob.download
          img["src"] = attachments.inline[unique_filename].url
        else
          # Fallback: if no img tag found, replace the whole figure
          replace_node_with_inline_image(doc, node, blob)
        end
      rescue JSON::ParserError => e
        Rails.logger.error "Error parsing Trix attachment JSON: #{e.message}"
      rescue StandardError => e
        Rails.logger.error "Error processing inline image: #{e.message}"
      end
    end

    doc.to_html
  end

  def replace_node_with_inline_image(doc, node, blob)
    # Create a unique filename to avoid collisions
    unique_filename = "#{blob.id}-#{blob.filename}"
    
    # Attach the file inline
    attachments.inline[unique_filename] = blob.download

    # Create the image tag
    img = Nokogiri::XML::Node.new "img", doc
    img["src"] = attachments.inline[unique_filename].url
    img["alt"] = blob.filename.to_s
    img["style"] = "max-width: 100%; height: auto;"
    
    # Replace the node with the image
    node.replace(img)
  end

  def generate_pdf_filename(property, inspection)
    # Sanitize property name for filename
    safe_property_name = property.property_name.gsub(/[^0-9A-Za-z.-]/, "_").downcase
    date_string = inspection.date.strftime("%m%d%Y")
    system_category = inspection.system_category
    interval_category = inspection.interval_category

    "#{safe_property_name}_inspection_#{system_category}_#{interval_category}_#{date_string}.pdf"
  end
end
