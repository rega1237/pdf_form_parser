FROM ruby:3.4.1

RUN apt-get update -qq && \
    apt-get install -y \
    build-essential \
    libpq-dev \
    nodejs \
    npm \
    pdftk-java \
    default-jre \
    libyaml-dev \
    libffi-dev \
    libssl-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY Gemfile Gemfile.lock ./

RUN bundle config build.psych --with-libyaml-include=/usr/include \
    --with-libyaml-lib=/usr/lib/x86_64-linux-gnu

RUN bundle install

COPY . .

# Saltar la precompilación de assets en Docker - se hará en runtime
# RUN RAILS_ENV=production bundle exec rails assets:precompile

EXPOSE 3000

# Comando que incluye la precompilación al inicio
CMD ["sh", "-c", "bundle exec rails assets:precompile && bundle exec rails server -b 0.0.0.0 -p 3000"]