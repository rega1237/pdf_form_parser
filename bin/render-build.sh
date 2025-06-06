# Exit on error
set -o errexit

# Check if we have permission to install packages
if [ "$EUID" -eq 0 ]; then
    echo "Installing system dependencies..."
    apt-get update
    apt-get install -y pdftk
else
    echo "Trying to install pdftk with sudo..."
    sudo apt-get update
    sudo apt-get install -y pdftk
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

# Database migration
# If you have a paid instance type, we recommend moving
# database migrations like this one from the build command
# to the pre-deploy command:
bin/rails db:migrate