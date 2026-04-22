class ApplicationMailer < ActionMailer::Base
  default from: ENV.fetch("MAILER_FROM_EMAIL", "noreply@example.com"),
          reply_to: ENV.fetch("MAILER_REPLY_TO", "support@example.com")

  layout "mailer"

  def default_sender_name
    ENV.fetch("COMPANY_NAME", "Inspection Services")
  end
end
