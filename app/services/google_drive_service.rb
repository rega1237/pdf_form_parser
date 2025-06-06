# app/services/google_drive_service.rb
require 'google/apis/drive_v3'
require 'googleauth'
require 'json'

class GoogleDriveService
  APPLICATION_NAME = 'PDF Form Parser'.freeze
  SCOPE = Google::Apis::DriveV3::AUTH_DRIVE_FILE

  def initialize
    @service = Google::Apis::DriveV3::DriveService.new
    @service.client_options.application_name = APPLICATION_NAME
    @service.authorization = authorize
  end

  def upload_file(file_path, file_name, mime_type, parent_id = nil)
    # First check if file exists
    query = "name = '#{file_name}' and trashed = false"
    query += " and '#{parent_id}' in parents" if parent_id.present?
    response = @service.list_files(q: query, fields: 'files(id)')

    if response.files.any?
      # File exists - update it
      file_id = response.files.first.id
      @service.update_file(file_id, nil, upload_source: file_path, content_type: mime_type)
      file_id
    else
      # File doesn't exist - create new
      file_metadata = Google::Apis::DriveV3::File.new(name: file_name)
      file_metadata.parents = [parent_id] if parent_id.present?
      created_file = @service.create_file(file_metadata, upload_source: file_path, content_type: mime_type,
                                                         fields: 'id')
      created_file.id
    end
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

  def get_file_url(file_id)
    "https://drive.google.com/file/d/#{file_id}/view"
  end

  private

  def authorize
    if use_service_account?
      authorize_service_account
    else
      authorize_oauth
    end
  rescue => e
    Rails.logger.error "Google Drive authorization failed: #{e.message}"
    Rails.logger.error "Please ensure Google Drive environment variables are correctly set up."
    nil
  end

  def use_service_account?
    ENV['GOOGLE_SERVICE_ACCOUNT_JSON'].present?
  end

  def authorize_service_account
    # Para usar Service Account (recomendado para producción)
    service_account_json = JSON.parse(ENV['GOOGLE_SERVICE_ACCOUNT_JSON'])
    
    Google::Auth::ServiceAccountCredentials.make_creds(
      json_key_io: StringIO.new(service_account_json.to_json),
      scope: SCOPE
    )
  end

  def authorize_oauth
    # Para usar OAuth (para desarrollo/testing)
    credentials_hash = get_credentials_from_env
    
    client_id = Google::Auth::ClientId.new(
      credentials_hash['client_id'],
      credentials_hash['client_secret']
    )
    
    token_hash = get_token_from_env
    
    credentials = Google::Auth::UserRefreshCredentials.new(
      client_id: client_id.id,
      client_secret: client_id.secret,
      scope: SCOPE,
      refresh_token: token_hash['refresh_token'],
      access_token: token_hash['access_token']
    )
    
    # Refresh token if needed
    credentials.refresh! if credentials.expired?
    credentials
  end

  def get_credentials_from_env
    if ENV['GOOGLE_DRIVE_CREDENTIALS_JSON'].present?
      credentials_json = ENV['GOOGLE_DRIVE_CREDENTIALS_JSON'].strip
      # Remove any BOM or invisible characters
      credentials_json = credentials_json.gsub(/\A\uFEFF/, '')
      JSON.parse(credentials_json)['installed']
    else
      {
        'client_id' => ENV['GOOGLE_CLIENT_ID'],
        'client_secret' => ENV['GOOGLE_CLIENT_SECRET']
      }
    end
  rescue JSON::ParserError => e
    Rails.logger.error "Error parsing GOOGLE_DRIVE_CREDENTIALS_JSON: #{e.message}"
    Rails.logger.error "JSON content preview: #{ENV['GOOGLE_DRIVE_CREDENTIALS_JSON']&.first(100)}"
    raise "Invalid GOOGLE_DRIVE_CREDENTIALS_JSON format: #{e.message}"
  end

  def get_token_from_env
    if ENV['GOOGLE_DRIVE_TOKEN_JSON'].present?
      token_json = ENV['GOOGLE_DRIVE_TOKEN_JSON'].strip
      # Remove any BOM or invisible characters
      token_json = token_json.gsub(/\A\uFEFF/, '')
      JSON.parse(token_json)
    else
      {
        'access_token' => ENV['GOOGLE_ACCESS_TOKEN'],
        'refresh_token' => ENV['GOOGLE_REFRESH_TOKEN']
      }
    end
  rescue JSON::ParserError => e
    Rails.logger.error "Error parsing GOOGLE_DRIVE_TOKEN_JSON: #{e.message}"
    Rails.logger.error "JSON content preview: #{ENV['GOOGLE_DRIVE_TOKEN_JSON']&.first(100)}"
    raise "Invalid GOOGLE_DRIVE_TOKEN_JSON format: #{e.message}"
  end
end
