FROM ruby:3.4.1

# Instalar dependencias del sistema incluyendo todas las necesarias para psych
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
    libreadline-dev \
    libsqlite3-dev \
    wget \
    curl \
    llvm \
    libncurses5-dev \
    libncursesw5-dev \
    xz-utils \
    tk-dev \
    libxml2-dev \
    libxmlsec1-dev \
    libgdbm-dev \
    libc6-dev \
    && rm -rf /var/lib/apt/lists/*

# Crear directorio de trabajo
WORKDIR /app

# Copiar Gemfile y Gemfile.lock
COPY Gemfile Gemfile.lock ./

# Configurar bundler para usar system gems para psych si es necesario
RUN bundle config build.psych --with-libyaml-include=/usr/include \
    --with-libyaml-lib=/usr/lib/x86_64-linux-gnu

# Instalar gems
RUN bundle install

# Copiar el código de la aplicación
COPY . .

# Precompilar assets (si usas assets)
RUN RAILS_ENV=production bundle exec rails assets:precompile

# Exponer el puerto
EXPOSE 3000

# Comando para iniciar la aplicación
CMD ["bundle", "exec", "rails", "server", "-b", "0.0.0.0", "-p", "3000"]
