#!/usr/bin/env bash

# Exit on error
set -o errexit

echo "🚀 Starting Render build process..."
echo "📁 Current directory: $(pwd)"
echo "📋 Ruby version: $(ruby -v)"
echo "💎 Bundler version: $(bundle -v)"

# Make sure the script is executable
chmod +x bin/render-build.sh

# Install system dependencies
echo "🔧 Attempting to install system dependencies..."

# Try to install pdftk (may not work in some environments)
if apt-get update >/dev/null 2>&1 && apt-get install -y pdftk >/dev/null 2>&1; then
    echo "✅ pdftk installed successfully"
else
    echo "⚠️  Warning: Cannot install pdftk in this environment"
    echo "💡 Consider using Docker or switching to HexaPDF gem"
fi

# Verify pdftk installation and show location
if command -v pdftk &> /dev/null; then
    echo "✅ pdftk successfully installed"
    echo "📍 pdftk location: $(which pdftk)"
    echo "📋 pdftk version: $(pdftk --version)"
    echo "🔍 pdftk file info: $(ls -la $(which pdftk))"
else
    echo "❌ Warning: pdftk installation failed"
    echo "🔍 Searching for pdftk in common locations..."
    find /usr -name "pdftk*" 2>/dev/null || echo "No pdftk found in /usr"
    find /bin -name "pdftk*" 2>/dev/null || echo "No pdftk found in /bin"
fi

# Show system information for debugging
echo "🖥️  System info:"
echo "   OS: $(cat /etc/os-release | grep PRETTY_NAME)"
echo "   Architecture: $(uname -m)"
echo "   PATH: $PATH"

# Install Ruby dependencies
bundle install

# Rails asset compilation
bin/rails assets:precompile
bin/rails assets:clean

# Database setup and migration
echo "🗄️  Setting up database..."
bin/rails db:create db:migrate