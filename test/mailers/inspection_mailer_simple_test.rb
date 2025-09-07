require 'test_helper'

class InspectionMailerSimpleTest < ActionMailer::TestCase
  # Disable fixtures completely
  self.use_transactional_tests = false

  def setup
    # Clear any existing data
    DatabaseCleaner.clean if defined?(DatabaseCleaner)
  end

  test 'mailer class exists and has send_inspection_pdf method' do
    assert_respond_to InspectionMailer, :send_inspection_pdf
  end

  test 'mailer inherits from ApplicationMailer' do
    assert_equal ApplicationMailer, InspectionMailer.superclass
  end

  test 'email templates exist' do
    html_template = Rails.root.join('app/views/inspection_mailer/send_inspection_pdf.html.erb')
    text_template = Rails.root.join('app/views/inspection_mailer/send_inspection_pdf.text.erb')

    assert File.exist?(html_template), 'HTML email template should exist'
    assert File.exist?(text_template), 'Text email template should exist'
  end

  test 'html template contains expected content' do
    html_content = File.read(Rails.root.join('app/views/inspection_mailer/send_inspection_pdf.html.erb'))

    assert_match(/Dear.*@customer\.name/, html_content)
    assert_match(/@property\.property_name/, html_content)
    assert_match(/@inspection\.date/, html_content)
    assert_match(/@inspector\.name/, html_content)
  end

  test 'text template contains expected content' do
    text_content = File.read(Rails.root.join('app/views/inspection_mailer/send_inspection_pdf.text.erb'))

    assert_match(/Dear.*@customer\.name/, text_content)
    assert_match(/@property\.property_name/, text_content)
    assert_match(/@inspection\.date/, text_content)
    assert_match(/@inspector\.name/, text_content)
  end
end
