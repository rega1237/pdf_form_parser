# lib/tasks/env_validator.rake
namespace :env do
  desc "Validate and clean Google Drive environment variables"
  task validate_google_drive: :environment do
    puts "🔍 Validating Google Drive environment variables..."
    
    # Check for credentials
    if ENV['GOOGLE_DRIVE_CREDENTIALS_JSON'].present?
      puts "\n📋 Found GOOGLE_DRIVE_CREDENTIALS_JSON"
      validate_json_env('GOOGLE_DRIVE_CREDENTIALS_JSON')
    elsif ENV['GOOGLE_CLIENT_ID'].present? && ENV['GOOGLE_CLIENT_SECRET'].present?
      puts "\n📋 Found individual credential variables"
      puts "✅ GOOGLE_CLIENT_ID: #{ENV['GOOGLE_CLIENT_ID']}"
      puts "✅ GOOGLE_CLIENT_SECRET: #{ENV['GOOGLE_CLIENT_SECRET'][0..10]}..."
    else
      puts "❌ No Google Drive credentials found!"
      puts "Please set either:"
      puts "- GOOGLE_DRIVE_CREDENTIALS_JSON (full JSON)"
      puts "- GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (individual variables)"
      return
    end
    
    # Check for token
    if ENV['GOOGLE_DRIVE_TOKEN_JSON'].present?
      puts "\n🔑 Found GOOGLE_DRIVE_TOKEN_JSON"
      validate_json_env('GOOGLE_DRIVE_TOKEN_JSON')
    elsif ENV['GOOGLE_REFRESH_TOKEN'].present?
      puts "\n🔑 Found individual token variables"
      puts "✅ GOOGLE_REFRESH_TOKEN: #{ENV['GOOGLE_REFRESH_TOKEN'][0..20]}..."
      puts "✅ GOOGLE_ACCESS_TOKEN: #{ENV['GOOGLE_ACCESS_TOKEN'] ? ENV['GOOGLE_ACCESS_TOKEN'][0..20] + '...' : 'Not set'}"
    else
      puts "❌ No Google Drive token found!"
      puts "Please set either:"
      puts "- GOOGLE_DRIVE_TOKEN_JSON (full JSON)"
      puts "- GOOGLE_REFRESH_TOKEN (and optionally GOOGLE_ACCESS_TOKEN)"
      return
    end
    
    # Test the actual connection
    puts "\n🔌 Testing connection to Google Drive..."
    begin
      service = GoogleDriveService.new
      puts "✅ Successfully created Google Drive service"
      
      # Test a simple API call
      service.instance_variable_get(:@service).list_files(
        q: "mimeType = 'application/vnd.google-apps.folder'",
        page_size: 1,
        fields: 'files(id, name)'
      )
      puts "✅ Successfully connected to Google Drive API"
      
    rescue => e
      puts "❌ Connection failed: #{e.message}"
      puts "\nDebugging info:"
      puts "- Check that your credentials are valid"
      puts "- Verify that Google Drive API is enabled in your Google Cloud Console"
      puts "- Make sure your OAuth consent screen is configured"
    end
  end
  
  desc "Clean and format Google Drive environment variables"
  task clean_google_drive: :environment do
    puts "🧹 Cleaning Google Drive environment variables..."
    
    # Clean credentials JSON
    if ENV['GOOGLE_DRIVE_CREDENTIALS_JSON'].present?
      original = ENV['GOOGLE_DRIVE_CREDENTIALS_JSON']
      cleaned = clean_json_string(original)
      
      if original != cleaned
        puts "🔧 GOOGLE_DRIVE_CREDENTIALS_JSON needs cleaning:"
        puts "Original length: #{original.length}"
        puts "Cleaned length: #{cleaned.length}"
        puts "Cleaned version:"
        puts "GOOGLE_DRIVE_CREDENTIALS_JSON='#{cleaned}'"
      else
        puts "✅ GOOGLE_DRIVE_CREDENTIALS_JSON is already clean"
      end
    end
    
    # Clean token JSON
    if ENV['GOOGLE_DRIVE_TOKEN_JSON'].present?
      original = ENV['GOOGLE_DRIVE_TOKEN_JSON']
      cleaned = clean_json_string(original)
      
      if original != cleaned
        puts "🔧 GOOGLE_DRIVE_TOKEN_JSON needs cleaning:"
        puts "Original length: #{original.length}"
        puts "Cleaned length: #{cleaned.length}"
        puts "Cleaned version:"
        puts "GOOGLE_DRIVE_TOKEN_JSON='#{cleaned}'"
      else
        puts "✅ GOOGLE_DRIVE_TOKEN_JSON is already clean"
      end
    end
  end
  
  private
  
  def validate_json_env(env_var)
    content = ENV[env_var].strip
    
    # Remove BOM and other invisible characters
    cleaned = content.gsub(/\A\uFEFF/, '')
    
    begin
      parsed = JSON.parse(cleaned)
      puts "✅ #{env_var} is valid JSON"
      
      if env_var.include?('CREDENTIALS')
        if parsed['installed']
          puts "  - Contains 'installed' section"
          puts "  - Client ID: #{parsed['installed']['client_id']}"
          puts "  - Project ID: #{parsed['installed']['project_id']}"
        else
          puts "  - ⚠️  Missing 'installed' section"
        end
      elsif env_var.include?('TOKEN')
        required_keys = ['refresh_token']
        optional_keys = ['access_token', 'client_id']
        
        required_keys.each do |key|
          if parsed[key]
            puts "  - ✅ #{key}: #{parsed[key][0..20]}..."
          else
            puts "  - ❌ Missing #{key}"
          end
        end
        
        optional_keys.each do |key|
          if parsed[key]
            puts "  - ✅ #{key}: #{parsed[key][0..20]}..."
          end
        end
      end
      
    rescue JSON::ParserError => e
      puts "❌ #{env_var} is invalid JSON: #{e.message}"
      puts "Content preview: #{cleaned[0..100]}..."
      
      # Show problematic characters
      puts "Character analysis:"
      cleaned[0..50].each_char.with_index do |char, i|
        if char.ord > 127 || char.ord < 32
          puts "  Position #{i}: '#{char}' (#{char.ord})"
        end
      end
    end
  end
  
  def clean_json_string(json_string)
    # Remove BOM and other invisible characters
    cleaned = json_string.strip.gsub(/\A\uFEFF/, '')
    
    # Remove any extra quotes at the beginning/end
    if cleaned.start_with?("'") && cleaned.end_with?("'")
      cleaned = cleaned[1..-2]
    elsif cleaned.start_with?('"') && cleaned.end_with?('"')
      cleaned = cleaned[1..-2]
    end
    
    cleaned
  end
end