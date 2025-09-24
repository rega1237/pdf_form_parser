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
      '/inspections',
      '/form_fills',
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
      const CACHE_NAME = 'aes-pro-cache-v#{cache_version}';
      const API_CACHE_NAME = 'aes-pro-api-cache-v#{cache_version}';
      const OFFLINE_CACHE_NAME = 'aes-pro-offline-cache-v#{cache_version}';

      const APP_SHELL_URLS = #{app_shell_urls.to_json};

      // Recursos para offline page
      const OFFLINE_FALLBACK_URL = '/offline.html';
      const OFFLINE_IMAGE_URL = '/offline-image.svg';

      // Patrones de URL para diferentes estrategias de cache
      const API_PATTERNS = [
        /\\/api\\//,
        /\\/inspections/,
        /\\/form_fills/,
        /\\/customers/
      ];

      const STATIC_PATTERNS = [
        /\\.css$/,
        /\\.js$/,
        /\\.png$/,
        /\\.jpg$/,
        /\\.jpeg$/,
        /\\.svg$/,
        /\\.ico$/
      ];

      // Instalación del Service Worker
      self.addEventListener('install', event => {
        console.log('🔧 Service Worker: Instalando...');
        self.skipWaiting(); // Activa inmediatamente el nuevo SW

        event.waitUntil(
          Promise.all([
            // Cache de App Shell
            caches.open(CACHE_NAME).then(cache => {
              console.log('📦 Service Worker: Cacheando App Shell...', APP_SHELL_URLS);
              return cache.addAll(APP_SHELL_URLS).catch(err => {
                console.error('❌ Error cacheando App Shell:', err);
                // Intentar cachear uno por uno para identificar el problema
                return Promise.all(
                  APP_SHELL_URLS.map(url =>
                    cache.add(url).catch(error => {
                      console.error('❌ Error cacheando:', url, error);
                      return null;
                    })
                  )
                );
              });
            }),
      #{'      '}
            // Cache de offline fallbacks
            caches.open(OFFLINE_CACHE_NAME).then(cache => {
              console.log('📱 Service Worker: Preparando recursos offline...');
      #{'        '}
              // Crear página offline básica
              const offlineHTML = `
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                  <title>Offline - Aes Pro</title>
                  <style>
                    body {
                      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                      margin: 0;
                      padding: 20px;
                      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
                      color: white;
                      min-height: 100vh;
                      display: flex;
                      flex-direction: column;
                      align-items: center;
                      justify-content: center;
                      text-align: center;
                    }
                    .offline-container {
                      max-width: 400px;
                      padding: 40px;
                      background: rgba(255, 255, 255, 0.1);
                      border-radius: 20px;
                      backdrop-filter: blur(10px);
                      border: 1px solid rgba(255, 255, 255, 0.2);
                    }
                    .offline-icon {
                      width: 80px;
                      height: 80px;
                      margin: 0 auto 20px;
                      background: #ef4444;
                      border-radius: 50%;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      font-size: 40px;
                    }
                    h1 { margin: 0 0 20px 0; color: #fff; }
                    p { margin: 0 0 30px 0; color: #cbd5e1; line-height: 1.6; }
                    .retry-btn {
                      background: #10b981;
                      color: white;
                      border: none;
                      padding: 12px 24px;
                      border-radius: 8px;
                      cursor: pointer;
                      font-size: 16px;
                      font-weight: 600;
                      transition: background 0.3s;
                    }
                    .retry-btn:hover { background: #059669; }
                    .features {
                      margin-top: 30px;
                      text-align: left;
                      background: rgba(255, 255, 255, 0.05);
                      padding: 20px;
                      border-radius: 12px;
                    }
                    .feature {
                      display: flex;
                      align-items: center;
                      margin-bottom: 12px;
                      font-size: 14px;
                    }
                    .feature-icon {
                      width: 20px;
                      height: 20px;
                      background: #10b981;
                      border-radius: 50%;
                      margin-right: 12px;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      font-size: 12px;
                    }
                  </style>
                </head>
                <body>
                  <div class="offline-container">
                    <div class="offline-icon">📱</div>
                    <h1>Sin Conexión</h1>
                    <p>No hay conexión a internet disponible. Algunas funciones están disponibles offline.</p>
                    <button class="retry-btn" onclick="window.location.reload()">
                      Reintentar Conexión
                    </button>
      #{'              '}
                    <div class="features">
                      <h3 style="margin: 0 0 15px 0; color: #fff; font-size: 16px;">Disponible Offline:</h3>
                      <div class="feature">
                        <div class="feature-icon">✓</div>
                        Ver inspecciones descargadas
                      </div>
                      <div class="feature">
                        <div class="feature-icon">✓</div>
                        Llenar formularios
                      </div>
                      <div class="feature">
                        <div class="feature-icon">✓</div>
                        Tomar fotos
                      </div>
                      <div class="feature">
                        <div class="feature-icon">✓</div>
                        Guardar cambios localmente
                      </div>
                    </div>
                  </div>
      #{'            '}
                  <script>
                    // Auto-retry connection every 30 seconds
                    let retryCount = 0;
                    const maxRetries = 10;
      #{'              '}
                    function checkConnection() {
                      if (navigator.onLine && retryCount < maxRetries) {
                        retryCount++;
                        fetch('/', { method: 'HEAD', cache: 'no-store' })
                          .then(() => {
                            window.location.reload();
                          })
                          .catch(() => {
                            setTimeout(checkConnection, 30000);
                          });
                      }
                    }
      #{'              '}
                    window.addEventListener('online', checkConnection);
                    setTimeout(checkConnection, 30000);
                  </script>
                </body>
                </html>
              `;
      #{'        '}
              // Guardar página offline
              return cache.put('/offline.html', new Response(offlineHTML, {
                headers: {
                  'Content-Type': 'text/html',
                  'Cache-Control': 'public, max-age=31536000'
                }
              }));
            })
          ])
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
                if (cache !== CACHE_NAME &&#{' '}
                    cache !== API_CACHE_NAME &&#{' '}
                    cache !== OFFLINE_CACHE_NAME) {
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

      // Función para determinar estrategia de cache según URL
      function getCacheStrategy(request) {
        const url = new URL(request.url);
      #{'  '}
        // APIs - Network First con fallback a cache
        if (API_PATTERNS.some(pattern => pattern.test(url.pathname))) {
          return 'network-first';
        }
      #{'  '}
        // Assets estáticos - Cache First
        if (STATIC_PATTERNS.some(pattern => pattern.test(url.pathname))) {
          return 'cache-first';
        }
      #{'  '}
        // Navegación - Network First con offline fallback
        if (request.mode === 'navigate') {
          return 'navigate';
        }
      #{'  '}
        // Otros - Network First
        return 'network-first';
      }

      // Estrategia Cache First
      async function cacheFirstStrategy(request, cacheName = CACHE_NAME) {
        const cache = await caches.open(cacheName);
        const cachedResponse = await cache.match(request);
      #{'  '}
        if (cachedResponse) {
          console.log('📦 Cache First - Sirviendo desde caché:', request.url);
      #{'    '}
          // Actualizar cache en background si no es muy reciente
          fetchAndCache(request, cache);
      #{'    '}
          return cachedResponse;
        }
      #{'  '}
        console.log('🌐 Cache First - Sirviendo desde red:', request.url);
        return fetchAndCache(request, cache);
      }

      // Estrategia Network First
      async function networkFirstStrategy(request, cacheName = API_CACHE_NAME) {
        const cache = await caches.open(cacheName);
      #{'  '}
        try {
          console.log('🌐 Network First - Intentando red:', request.url);
          const networkResponse = await fetch(request);
      #{'    '}
          // Solo cachear respuestas exitosas
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
      #{'      '}
            // Cachear con expiración para APIs
            const headers = new Headers(responseClone.headers);
            headers.set('sw-cached-at', Date.now().toString());
      #{'      '}
            const cachedResponse = new Response(responseClone.body, {
              status: responseClone.status,
              statusText: responseClone.statusText,
              headers: headers
            });
      #{'      '}
            cache.put(request, cachedResponse);
          }
      #{'    '}
          return networkResponse;
        } catch (error) {
          console.log('📦 Network First - Fallback a caché:', request.url);
          const cachedResponse = await cache.match(request);
      #{'    '}
          if (cachedResponse) {
            // Verificar si cache está muy viejo (más de 1 hora para APIs)
            const cachedAt = cachedResponse.headers.get('sw-cached-at');
            const isStale = cachedAt && (Date.now() - parseInt(cachedAt)) > 3600000;
      #{'      '}
            if (isStale) {
              console.log('⚠️ Sirviendo datos obsoletos:', request.url);
            }
      #{'      '}
            return cachedResponse;
          }
      #{'    '}
          throw error;
        }
      }

      // Estrategia para navegación
      async function navigateStrategy(request) {
        try {
          console.log('🌐 Navigate - Intentando red:', request.url);
          const networkResponse = await fetch(request);
      #{'    '}
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
          }
      #{'    '}
          return networkResponse;
        } catch (error) {
          console.log('📱 Navigate - Fallback a offline page');
      #{'    '}
          // Verificar si hay cache de la página
          const cache = await caches.open(CACHE_NAME);
          const cachedResponse = await cache.match(request);
      #{'    '}
          if (cachedResponse) {
            return cachedResponse;
          }
      #{'    '}
          // Servir página offline
          const offlineCache = await caches.open(OFFLINE_CACHE_NAME);
          return offlineCache.match('/offline.html');
        }
      }

      // Función auxiliar para fetch y cache
      async function fetchAndCache(request, cache) {
        try {
          const networkResponse = await fetch(request);
      #{'    '}
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            cache.put(request, networkResponse.clone());
          }
      #{'    '}
          return networkResponse;
        } catch (error) {
          console.error('❌ Error en fetch:', request.url, error);
          throw error;
        }
      }

      // Interceptación principal de requests
      self.addEventListener('fetch', event => {
        const url = new URL(event.request.url);
      #{'  '}
        // Skip requests externos
        if (url.origin !== location.origin) {
          return;
        }

        // Solo manejar requests GET
        if (event.request.method !== 'GET') {
          return;
        }

        const strategy = getCacheStrategy(event.request);
      #{'  '}
        event.respondWith(
          (async () => {
            try {
              switch (strategy) {
                case 'cache-first':
                  return await cacheFirstStrategy(event.request);
      #{'            '}
                case 'network-first':
                  return await networkFirstStrategy(event.request);
      #{'            '}
                case 'navigate':
                  return await navigateStrategy(event.request);
      #{'            '}
                default:
                  return await networkFirstStrategy(event.request);
              }
            } catch (error) {
              console.error('❌ Error manejando request:', event.request.url, error);
      #{'        '}
              // Último fallback
              if (event.request.mode === 'navigate') {
                const offlineCache = await caches.open(OFFLINE_CACHE_NAME);
                return offlineCache.match('/offline.html');
              }
      #{'        '}
              throw error;
            }
          })()
        );
      });

      // Manejo de background sync (preparación para Task 9)
      self.addEventListener('sync', event => {
        console.log('🔄 Background Sync triggered:', event.tag);
      #{'  '}
        if (event.tag === 'sync-form-data') {
          event.waitUntil(
            // Placeholder para sincronización de datos
            Promise.resolve().then(() => {
              console.log('📤 Sync de datos pendiente para implementar');
            })
          );
        }
      });

      // Manejo de mensajes desde la app
      self.addEventListener('message', event => {
        if (event.data && event.data.type === 'SKIP_WAITING') {
          self.skipWaiting();
        }
      #{'  '}
        if (event.data && event.data.type === 'CACHE_URLS') {
          const urls = event.data.urls;
          caches.open(API_CACHE_NAME).then(cache => {
            return cache.addAll(urls);
          });
        }
      #{'  '}
        if (event.data && event.data.type === 'CLEAR_CACHE') {
          caches.keys().then(cacheNames => {
            return Promise.all(
              cacheNames.map(cache => caches.delete(cache))
            );
          });
        }
      });

      // Limpieza periódica de cache
      self.addEventListener('notificationclick', event => {
        // Placeholder para notificaciones push futuras
        console.log('🔔 Notification clicked');
      });

      console.log('🚀 Service Worker completamente cargado y listo');
    JAVASCRIPT

    render plain: js_content
  end
end
