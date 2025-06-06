
FROM ruby:3.2-slim

# Install system dependencies including pdftk
RUN apt-get update && apt-get install -y \
    pdftk \
    postgresql-client \
    build-essential \
    libpq-dev \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy Gemfile and install gems
COPY Gemfile Gemfile.lock ./
RUN bundle install

# Copy the rest of the application
COPY . .

# Create bin directory and copy build script
RUN chmod +x bin/render-build.sh

# Set environment variables
ENV RAILS_ENV=production
ENV RAILS_SERVE_STATIC_FILES=true
ENV RAILS_LOG_TO_STDOUT=true

# Expose port
EXPOSE 3000

# Default command
CMD ["bundle", "exec", "rails", "server", "-b", "0.0.0.0", "-p", "3000"]
