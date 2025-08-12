require 'test_helper'

class ApplicationMailerTest < ActionMailer::TestCase
  # Skip fixtures to avoid foreign key issues
  self.use_transactional_tests = false

  test 'default from email is configured' do
    # Test that the default from email is set correctly
    assert_equal ENV.fetch('MAILER_FROM_EMAIL', 'noreply@example.com'), ApplicationMailer.default[:from]
  end

  test 'default reply_to email is configured' do
    # Test that the default reply_to email is set correctly
    assert_equal ENV.fetch('MAILER_REPLY_TO', 'support@example.com'), ApplicationMailer.default[:reply_to]
  end

  test 'default sender name is available' do
    # Test that the default sender name method works
    mailer = ApplicationMailer.new
    assert_equal ENV.fetch('COMPANY_NAME', 'Inspection Services'), mailer.send(:default_sender_name)
  end
end
