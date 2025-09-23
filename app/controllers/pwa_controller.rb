class PwaController < ApplicationController
  # Desactivamos la protección CSRF para estas rutas
  skip_before_action :verify_authenticity_token
  skip_before_action :authenticate_user! # Si tienes autenticación

  layout false

  def manifest
    # Configuramos el content-type correctamente
    response.headers['Content-Type'] = 'application/manifest+json'

    # Renderizamos JSON directamente
    render json: {
      name: 'Aes Pro',
      short_name: 'Aes Pro',
      description: 'Aplicación de inspecciones para trabajar online y offline.',
      start_url: '/',
      display: 'standalone',
      scope: '/',
      background_color: '#0f172a',
      theme_color: '#1e293b',
      orientation: 'portrait',
      categories: %w[business productivity],
      icons: [
        {
          src: view_context.asset_path('logo_192.png'),
          type: 'image/png',
          sizes: '192x192'
        },
        {
          src: view_context.asset_path('logo_512.png'),
          type: 'image/png',
          sizes: '512x512'
        },
        {
          src: view_context.asset_path('logo_512.png'),
          type: 'image/png',
          sizes: '512x512',
          purpose: 'maskable'
        }
      ],
      screenshots: [
        {
          src: view_context.asset_path('logo_512.png'),
          type: 'image/png',
          sizes: '512x512',
          form_factor: 'narrow'
        },
        {
          src: view_context.asset_path('logo_512.png'),
          type: 'image/png',
          sizes: '512x512',
          form_factor: 'wide'
        }
      ]
    }
  end

  def service_worker
    # Configuramos el content-type correctamente
    response.headers['Content-Type'] = 'application/javascript'

    # Lista de recursos críticos para cachear
    app_shell_urls = [
      '/',
      view_context.asset_path('application.js'),
      view_context.asset_path('application.css'),
      view_context.asset_path('logo_192.png'),
      view_context.asset_path('logo_512.png')
    ]

    # Cache estática en producción, dinámica en desarrollo
    cache_version = if Rails.env.development?
                      # En desarrollo, usar versión fija para evitar updates constantes
                      'dev-1.0.0'
                    else
                      # En producción, usar hash de assets para detectar cambios reales
                      Digest::MD5.hexdigest(app_shell_urls.join)[0..7]
                    end

    # Generamos el JavaScript del Service Worker
    js_content = <<~JAVASCRIPT
      const CACHE_NAME = 'aes-pro-cache-v#{cache_version}'; // Versión estática
      const APP_SHELL_URLS = #{app_shell_urls.to_json};

      // Instalación del Service Worker
      self.addEventListener('install', event => {
        console.log('🔧 Service Worker: Instalando...');
        self.skipWaiting(); // Activa inmediatamente el nuevo SW
      #{'  '}
        event.waitUntil(
          caches.open(CACHE_NAME).then(cache => {
            console.log('📦 Service Worker: Cacheando recursos...', APP_SHELL_URLS);
            return cache.addAll(APP_SHELL_URLS).catch(err => {
              console.error('❌ Error cacheando recursos:', err);
              // Intentar cachear uno por uno para identificar el problema
              return Promise.all(
                APP_SHELL_URLS.map(url =>#{' '}
                  cache.add(url).catch(error => {
                    console.error('❌ Error cacheando:', url, error);
                    return null;
                  })
                )
              );
            });
          })
        );
      });

      // Activación del Service Worker
      self.addEventListener('activate', event => {
        console.log('✅ Service Worker: Activando...');
      #{'  '}
        event.waitUntil(
          caches.keys().then(cacheNames => {
            return Promise.all(
              cacheNames.map(cache => {
                if (cache !== CACHE_NAME) {
                  console.log('🗑️ Service Worker: Limpiando caché antiguo:', cache);
                  return caches.delete(cache);
                }
              })
            );
          }).then(() => {
            console.log('🎉 Service Worker: Activado y reclamando clientes');
            return self.clients.claim();
          })
        );
      });

      // Estrategia de caché: Cache First para assets, Network First para páginas
      self.addEventListener('fetch', event => {
        const url = new URL(event.request.url);
      #{'  '}
        // Skip requests to external domains
        if (url.origin !== location.origin) {
          return;
        }

        // IMPORTANTE: Solo cachear requests GET
        if (event.request.method !== 'GET') {
          return;
        }

        event.respondWith(
          caches.match(event.request).then(response => {
            if (response) {
              console.log('📦 Sirviendo desde caché:', event.request.url);
              return response;
            }

            console.log('🌐 Sirviendo desde red:', event.request.url);
            return fetch(event.request).then(fetchResponse => {
              // Solo cachear respuestas válidas y recursos estáticos
              if (fetchResponse && fetchResponse.status === 200 && fetchResponse.type === 'basic') {
                const responseClone = fetchResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(event.request, responseClone);
                });
              }
              return fetchResponse;
            }).catch(error => {
              console.error('❌ Error en fetch:', event.request.url, error);
              // Retornar página offline si es una navegación
              if (event.request.mode === 'navigate') {
                return caches.match('/');
              }
              throw error;
            });
          })
        );
      });

      // Manejo de mensajes desde la app
      self.addEventListener('message', event => {
        if (event.data && event.data.type === 'SKIP_WAITING') {
          self.skipWaiting();
        }
      });
    JAVASCRIPT

    render plain: js_content
  end
end
