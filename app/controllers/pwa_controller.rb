class PwaController < ApplicationController
  # Descomenta la siguiente línea si usas Devise o similar
  # y quieres que el manifest y service worker sean accesibles sin autenticación.
  skip_before_action :authenticate_user!

  def manifest
    render file: Rails.root.join('app/views/pwa/manifest.json.erb'), content_type: 'application/json'
  end

  def service_worker
    # Asegúrate de que el archivo service-worker tenga la extensión .erb
    render file: Rails.root.join('app/views/pwa/service-worker.js.erb'), content_type: 'application/javascript'
  end
end
