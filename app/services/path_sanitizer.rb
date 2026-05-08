# frozen_string_literal: true

require "tmpdir"

module PathSanitizer
  def self.ensure_safe_path!(path)
    raise ArgumentError, "Path is nil" if path.nil?

    resolved_path = File.expand_path(path.to_s)
    rails_root = Rails.root.to_s
    system_tmpdir = File.expand_path(Dir.tmpdir)

    # Allow paths inside Rails root or standard temporary directory
    unless resolved_path.start_with?(rails_root) ||
           resolved_path.start_with?("/tmp") ||
           resolved_path.start_with?("/var/folders") ||
           resolved_path.start_with?(system_tmpdir)
      raise SecurityError, "Path traversal attempt detected: #{path}"
    end

    path
  end
end
