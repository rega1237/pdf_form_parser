require 'test_helper'

class InspectionMailerTest < ActionMailer::TestCase
  # Skip fixtures to avoid foreign key issues
  self.use_transactional_tests = false

  setup do
    # Create test data manually
    @customer = Customer.create!(
      name: 'Test Customer',
      email: 'customer@example.com',
      customer_type: 'Individual',
      address: '123 Test St',
      city_state_zip: 'Test City, ST 12345'
    )

    @property = Property.create!(
      customer: @customer,
      property_name: 'Test Property',
      address: '123 Test Property St',
      property_type: 'Commercial'
    )

    @user = User.create!(
      email: 'inspector@example.com',
      name: 'Test Inspector',
      password: 'password123',
      password_confirmation: 'password123'
    )

    @form_template = FormTemplate.create!(
      name: 'Test Form Template'
    )

    @inspection = Inspection.create!(
      property: @property,
      user: @user,
      form_template: @form_template,
      date: Date.current
    )

    @form_fill = FormFill.create!(
      form_template: @form_template,
      inspection: @inspection,
      name: 'Test Form Fill'
    )
  end

  teardown do
    # Clean up test data
    [@form_fill, @inspection, @form_template, @user, @property, @customer].each do |record|
      record&.destroy
    end
  end

  test 'send_inspection_pdf generates email with correct recipient' do
    mail = InspectionMailer.send_inspection_pdf(@form_fill.id)

    assert_equal [@customer.email], mail.to
    assert_match "Inspection Report for #{@property.property_name}", mail.subject
    assert_match @customer.name, mail.body.encoded
    assert_match @property.property_name, mail.body.encoded
  end

  test 'send_inspection_pdf uses custom recipient email when provided' do
    custom_email = 'custom@example.com'
    mail = InspectionMailer.send_inspection_pdf(@form_fill.id, custom_email)

    assert_equal [custom_email], mail.to
  end

  test 'send_inspection_pdf includes inspection details in body' do
    mail = InspectionMailer.send_inspection_pdf(@form_fill.id)

    assert_match @property.property_name, mail.body.encoded
    assert_match @property.address, mail.body.encoded
    assert_match @user.name, mail.body.encoded
    assert_match @form_template.name, mail.body.encoded
  end

  test 'send_inspection_pdf generates proper subject line' do
    mail = InspectionMailer.send_inspection_pdf(@form_fill.id)
    expected_subject = "Inspection Report for #{@property.property_name} - #{@inspection.date.strftime('%B %d, %Y')}"

    assert_equal expected_subject, mail.subject
  end

  test 'send_inspection_pdf includes company name in from field' do
    mail = InspectionMailer.send_inspection_pdf(@form_fill.id)
    expected_from = "#{ENV.fetch('COMPANY_NAME',
                                 'Inspection Services')} <#{ENV.fetch('MAILER_FROM_EMAIL', 'noreply@example.com')}>"

    assert_equal [expected_from], mail.from
  end
end
