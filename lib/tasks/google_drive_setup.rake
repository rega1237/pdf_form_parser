# lib/tasks/google_drive_setup.rake
namespace :google_drive do
  desc "Test Google Drive configuration"
  task test_config: :environment do
    puts "Testing Google Drive configuration..."
    
    begin
      service = GoogleDriveService.new
      puts "✅ Google Drive service initialized successfully"
      
      # Test basic functionality
      folders = service.instance_variable_get(:@service).list_files(
        q: "mimeType = 'application/vnd.google-apps.folder'",
        page_size: 5,
        fields: 'files(id, name)'
      )
      
      puts "✅ Successfully connected to Google Drive"
      puts "Found #{folders.files.length} folders in your Drive"
      
    rescue => e
      puts "❌ Error: #{e.message}"
      puts "\nMake sure you have set the following environment variables:"
      
      if ENV['GOOGLE_SERVICE_ACCOUNT_JSON'].present?
        puts "- GOOGLE_SERVICE_ACCOUNT_JSON (Service Account - recommended for production)"
      else
        puts "- GOOGLE_DRIVE_CREDENTIALS_JSON or individual variables:"
        puts "  - GOOGLE_CLIENT_ID"
        puts "  - GOOGLE_CLIENT_SECRET"
        puts "- GOOGLE_DRIVE_TOKEN_JSON or individual variables:"
        puts "  - GOOGLE_ACCESS_TOKEN"
        puts "  - GOOGLE_REFRESH_TOKEN"
      end
    end
  end

  desc "Generate environment variables from existing config files"
  task generate_env_vars: :environment do
    puts "Generating environment variables from config files..."
    
    credentials_path = Rails.root.join('config', 'google_drive_credentials.json')
    token_path = Rails.root.join('config', 'token.yaml')
    
    if File.exist?(credentials_path)
      credentials_content = File.read(credentials_path)
      puts "\n# Add this to your .env file:"
      puts "GOOGLE_DRIVE_CREDENTIALS_JSON='#{credentials_content.gsub("'", "\\'")}'"
    else
      puts "❌ Credentials file not found at #{credentials_path}"
    end
    
    if File.exist?(token_path)
      require 'yaml'
      token_data = YAML.load_file(token_path)
      token_json = token_data['default']
      puts "GOOGLE_DRIVE_TOKEN_JSON='#{token_json.gsub("'", "\\'")}'"
    else
      puts "❌ Token file not found at #{token_path}"
    end
    
    puts "\n# Or use individual variables:"
    if File.exist?(credentials_path)
      creds = JSON.parse(File.read(credentials_path))['installed']
      puts "GOOGLE_CLIENT_ID=#{creds['client_id']}"
      puts "GOOGLE_CLIENT_SECRET=#{creds['client_secret']}"
    end
    
    if File.exist?(token_path)
      require 'yaml'
      token_data = YAML.load_file(token_path)
      token_hash = JSON.parse(token_data['default'])
      puts "GOOGLE_ACCESS_TOKEN=#{token_hash['access_token']}"
      puts "GOOGLE_REFRESH_TOKEN=#{token_hash['refresh_token']}"
    end
  end

  desc "Show current environment configuration"
  task show_config: :environment do
    puts "Current Google Drive configuration:"
    
    if ENV['GOOGLE_SERVICE_ACCOUNT_JSON'].present?
      puts "✅ Using Service Account (recommended for production)"
      service_account = JSON.parse(ENV['GOOGLE_SERVICE_ACCOUNT_JSON'])
      puts "   Project ID: #{service_account['project_id']}"
      puts "   Client Email: #{service_account['client_email']}"
    elsif ENV['GOOGLE_DRIVE_CREDENTIALS_JSON'].present?
      puts "✅ Using OAuth with full JSON credentials"
      creds = JSON.parse(ENV['GOOGLE_DRIVE_CREDENTIALS_JSON'])['installed']
      puts "   Client ID: #{creds['client_id']}"
      puts "   Project ID: #{creds['project_id']}"
    elsif ENV['GOOGLE_CLIENT_ID'].present?
      puts "✅ Using OAuth with individual environment variables"
      puts "   Client ID: #{ENV['GOOGLE_CLIENT_ID']}"
    else
      puts "❌ No Google Drive configuration found"
    end
    
    if ENV['GOOGLE_DRIVE_TOKEN_JSON'].present?
      puts "✅ Token configured (JSON format)"
    elsif ENV['GOOGLE_REFRESH_TOKEN'].present?
      puts "✅ Token configured (individual variables)"
    elsif !ENV['GOOGLE_SERVICE_ACCOUNT_JSON'].present?
      puts "❌ No token configuration found"
    end
  end
end