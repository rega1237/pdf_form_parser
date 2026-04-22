# Preview all emails at http://localhost:3000/rails/mailers/inspection_mailer
class InspectionMailerPreview < ActionMailer::Preview
  # Preview this email at http://localhost:3000/rails/mailers/inspection_mailer/send_inspection_pdf
  def send_inspection_pdf
    # Find a form_fill with an attached PDF for preview
    form_fill = FormFill.joins(inspection: [ property: :customer ])
                        .where.not(customers: { email: [ nil, "" ] })
                        .first

    if form_fill
      InspectionMailer.send_inspection_pdf(form_fill.id)
    else
      # Create a mock email if no suitable form_fill exists
      InspectionMailer.send_inspection_pdf(1, "preview@example.com")
    end
  end
end
