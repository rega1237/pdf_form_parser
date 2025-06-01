# lib/tasks/google_drive_auth.rake
require 'google/apis/drive_v3'
require 'googleauth'
require 'googleauth/stores/file_token_store'

namespace :google_drive do
  desc 'Authorize Google Drive API'
  task :authorize do
    OOB_URI = 'urn:ietf:wg:oauth:2.0:oob'.freeze
    CREDENTIALS_PATH = Rails.root.join('config', 'google_drive_credentials.json').to_s.freeze
    TOKEN_PATH = Rails.root.join('config', 'token.yaml').to_s.freeze
    SCOPE = Google::Apis::DriveV3::AUTH_DRIVE_FILE

    client_id = Google::Auth::ClientId.from_file(CREDENTIALS_PATH)
    token_store = Google::Auth::Stores::FileTokenStore.new(file: TOKEN_PATH)
    authorizer = Google::Auth::UserAuthorizer.new(client_id, SCOPE, token_store)

    credentials = authorizer.get_credentials('default')

    if credentials.nil?
      url = authorizer.get_authorization_url(base_url: OOB_URI)
      puts 'Open the following URL in your browser and authorize the application.'
      puts url
      print 'Enter the authorization code: '
      code = $stdin.gets.chomp

      credentials = authorizer.get_and_store_credentials_from_code(
        user_id: 'default',
        code: code,
        base_url: OOB_URI
      )
      puts "Credentials saved to #{TOKEN_PATH}"
    else
      puts "Credentials already exist for 'default' user."
    end
  end
end
