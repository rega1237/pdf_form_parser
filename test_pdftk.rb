require 'pdf-forms'
pdftk = PdfForms.new
begin
  puts pdftk.call_pdftk("invalid.pdf", "output", "out.pdf", "flatten")
rescue => e
  puts "Rescued: #{e.class} - #{e.message}"
end
