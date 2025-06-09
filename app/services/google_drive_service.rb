# app/services/google_drive_service.rb
require 'google/apis/drive_v3'
require 'googleauth'
require 'json'

class GoogleDriveService
  APPLICATION_NAME = 'PDF Form Parser'.freeze
  SCOPE = Google::Apis::DriveV3::AUTH_DRIVE_FILE

  # Cache para evitar múltiples autorizaciones
  @@cached_authorization = nil
  @@authorization_timestamp = nil
  CACHE_DURATION = 55.minutes # Google tokens duran 1 hora, renovamos antes

  def initialize
    @service = Google::Apis::DriveV3::DriveService.new
    @service.client_options.application_name = APPLICATION_NAME
    @service.authorization = get_cached_authorization
  end

  def upload_file(file_path, file_name, mime_type, parent_id = nil)
    retries = 0
    begin
      # Verificar si el archivo existe
      query = "name = '#{sanitize_query(file_name)}' and trashed = false"
      query += " and '#{parent_id}' in parents" if parent_id.present?
      response = @service.list_files(q: query, fields: 'files(id)')

      if response.files.any?
        # Actualizar archivo existente
        file_id = response.files.first.id
        @service.update_file(file_id, nil, upload_source: file_path, content_type: mime_type)
        file_id
      else
        # Crear nuevo archivo
        file_metadata = Google::Apis::DriveV3::File.new(name: file_name)
        file_metadata.parents = [parent_id] if parent_id.present?
        created_file = @service.create_file(
          file_metadata,
          upload_source: file_path,
          content_type: mime_type,
          fields: 'id'
        )
        created_file.id
      end
    rescue Google::Apis::AuthorizationError => e
      Rails.logger.error "Google Drive authorization error: #{e.message}"
      refresh_authorization if retries == 0
      retries += 1
      retry if retries <= 1
      raise e
    rescue Google::Apis::RateLimitError => e
      Rails.logger.warn "Google Drive rate limit hit, waiting..."
      sleep(2 ** retries) # Exponential backoff
      retries += 1
      retry if retries <= 3
      raise e
    rescue => e
      Rails.logger.error "Google Drive upload error: #{e.message}"
      raise e
    end
  end

  def download_file(file_id, download_path)
    retries = 0
    begin
      @service.get_file(file_id, download_dest: download_path)
    rescue Google::Apis::AuthorizationError => e
      refresh_authorization if retries == 0
      retries += 1
      retry if retries <= 1
      raise e
    rescue => e
      Rails.logger.error "Google Drive download error: #{e.message}"
      raise e
    end
  end

  def delete_file(file_id)
    retries = 0
    begin
      @service.delete_file(file_id)
    rescue Google::Apis::AuthorizationError => e
      refresh_authorization if retries == 0
      retries += 1
      retry if retries <= 1
      raise e
    rescue => e
      Rails.logger.error "Google Drive delete error: #{e.message}"
      raise e
    end
  end

  def find_or_create_folder(folder_name, parent_id = nil)
    retries = 0
    begin
      query = "name = '#{sanitize_query(folder_name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
      query += " and '#{parent_id}' in parents" if parent_id.present?
      response = @service.list_files(q: query, fields: 'files(id, name)')
      folder = response.files.first

      unless folder
        file_metadata = Google::Apis::DriveV3::File.new(
          name: folder_name,
          mime_type: 'application/vnd.google-apps.folder'
        )
        file_metadata.parents = [parent_id] if parent_id.present?
        folder = @service.create_file(file_metadata, fields: 'id, name')
      end
      folder.id
    rescue Google::Apis::AuthorizationError => e
      refresh_authorization if retries == 0
      retries += 1
      retry if retries <= 1
      raise e
    rescue => e
      Rails.logger.error "Google Drive folder creation error: #{e.message}"
      raise e
    end
  end

  def get_file_url(file_id)
    "https://drive.google.com/file/d/#{file_id}/view"
  end

  # Método para verificar si el servicio está funcionando
  def health_check
    @service.about(fields: 'user')
    true
  rescue => e
    Rails.logger.error "Google Drive health check failed: #{e.message}"
    false
  end

  private

  def get_cached_authorization
    if @@cached_authorization && @@authorization_timestamp && 
       (Time.current - @@authorization_timestamp) < CACHE_DURATION
      return @@cached_authorization
    end

    @@cached_authorization = authorize
    @@authorization_timestamp = Time.current
    @@cached_authorization
  end

  def refresh_authorization
    Rails.logger.info "Refreshing Google Drive authorization"
    @@cached_authorization = nil
    @@authorization_timestamp = nil
    @service.authorization = get_cached_authorization
  end

  def authorize
    if use_service_account?
      authorize_service_account
    else
      authorize_oauth
    end
  rescue => e
    Rails.logger.error "Google Drive authorization failed: #{e.message}"
    Rails.logger.error "Stack trace: #{e.backtrace.first(5).join('\n')}"
    
    # En producción, es crítico que esto funcione
    if Rails.env.production?
      raise "Google Drive authorization failed in production: #{e.message}"
    else
      Rails.logger.error "Please ensure Google Drive environment variables are correctly set up."
      nil
    end
  end

  def use_service_account?
    ENV['GOOGLE_SERVICE_ACCOUNT_JSON'].present?
  end

  def authorize_service_account
    service_account_json = JSON.parse(ENV['GOOGLE_SERVICE_ACCOUNT_JSON'])
    
    # Validar que tenga los campos necesarios
    required_fields = ['type', 'project_id', 'private_key_id', 'private_key', 'client_email']
    missing_fields = required_fields - service_account_json.keys
    
    if missing_fields.any?
      raise "Service Account JSON is missing required fields: #{missing_fields.join(', ')}"
    end
    
    Google::Auth::ServiceAccountCredentials.make_creds(
      json_key_io: StringIO.new(service_account_json.to_json),
      scope: SCOPE
    )
  end

  def authorize_oauth
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
    
    # Renovar token si es necesario
    credentials.refresh! if credentials.expired?
    credentials
  end

  def get_credentials_from_env
    if ENV['GOOGLE_DRIVE_CREDENTIALS_JSON'].present?
      credentials_json = clean_json_string(ENV['GOOGLE_DRIVE_CREDENTIALS_JSON'])
      parsed = JSON.parse(credentials_json)
      parsed['installed'] || parsed['web'] || parsed
    else
      validate_oauth_env_vars!
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
      token_json = clean_json_string(ENV['GOOGLE_DRIVE_TOKEN_JSON'])
      JSON.parse(token_json)
    else
      validate_oauth_env_vars!
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

  def clean_json_string(json_string)
    json_string.strip.gsub(/\A\uFEFF/, '').gsub(/\r\n|\r|\n/, '')
  end

  def validate_oauth_env_vars!
    required_vars = %w[GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_ACCESS_TOKEN GOOGLE_REFRESH_TOKEN]
    missing_vars = required_vars.select { |var| ENV[var].blank? }
    
    if missing_vars.any?
      raise "Missing required environment variables: #{missing_vars.join(', ')}"
    end
  end

  def sanitize_query(query_string)
    # Escapar caracteres especiales en queries de Google Drive
    query_string.gsub("'", "\\'")
  end
end
