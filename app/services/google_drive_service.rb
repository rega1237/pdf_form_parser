# app/services/google_drive_service.rb
require 'google/apis/drive_v3'
require 'googleauth'
require 'googleauth/stores/file_token_store'

class GoogleDriveService
  OOB_URI = 'urn:ietf:wg:oauth:2.0:oob'.freeze
  APPLICATION_NAME = 'PDF Form Parser'.freeze
  CREDENTIALS_PATH = Rails.root.join('config', 'google_drive_credentials.json').to_s.freeze
  TOKEN_PATH = Rails.root.join('config', 'token.yaml').to_s.freeze
  SCOPE = Google::Apis::DriveV3::AUTH_DRIVE_FILE

  def initialize
    @service = Google::Apis::DriveV3::DriveService.new
    @service.client_options.application_name = APPLICATION_NAME
    @service.authorization = authorize
  end

  def upload_file(file_path, file_name, mime_type, parent_id = nil)
    file_metadata = Google::Apis::DriveV3::File.new(name: file_name)
    file_metadata.parents = [parent_id] if parent_id.present?
    @service.create_file(file_metadata, upload_source: file_path, content_type: mime_type, fields: 'id')
  end

  def download_file(file_id, download_path)
    @service.get_file(file_id, download_dest: download_path)
  end

  def delete_file(file_id)
    @service.delete_file(file_id)
  end

  def find_or_create_folder(folder_name, parent_id = nil)
    query = "name = '#{folder_name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    query += " and '#{parent_id}' in parents" if parent_id.present?
    response = @service.list_files(q: query, fields: 'files(id, name)')
    folder = response.files.first

    unless folder
      file_metadata = Google::Apis::DriveV3::File.new(name: folder_name,
                                                      mime_type: 'application/vnd.google-apps.folder')
      file_metadata.parents = [parent_id] if parent_id.present?
      folder = @service.create_file(file_metadata, fields: 'id, name')
    end
    folder.id
  end

  private

  def authorize
    client_id = Google::Auth::ClientId.from_file(CREDENTIALS_PATH)
    token_store = Google::Auth::Stores::FileTokenStore.new(file: TOKEN_PATH)
    authorizer = Google::Auth::UserAuthorizer.new(client_id, SCOPE, token_store)

    # This part needs to be handled interactively for the first time setup.
    # For a web application, you'd typically use a service account or a web flow.
    # For simplicity in development, we'll assume a pre-authorized token.yaml exists.
    # In a production Rails app, you'd use a service account or OAuth 2.0 web application flow.

    # For initial setup, you might run this in a Rake task or a separate script:
    # url = authorizer.get_authorization_url(base_url: OOB_URI)
    # puts "Open the following URL in your browser and authorize the application."
    # puts url
    # code = gets
    # credentials = authorizer.get_and_store_credentials_from_code(
    #   user_id: 'default',
    #   code: code,
    #   base_url: OOB_URI
    # )

    # For now, we'll try to load existing credentials.
    authorizer.get_credentials('default')
  rescue Google::Auth::UserAuthorizer::AuthError => e
    Rails.logger.error "Google Drive authorization failed: #{e.message}"
    Rails.logger.error "Please ensure 'config/google_drive_credentials.json' and 'config/token.yaml' are correctly set up."
    nil # Or raise a more specific error
  end
end
