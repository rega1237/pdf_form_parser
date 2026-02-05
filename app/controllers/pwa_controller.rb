class PwaController < ApplicationController
  # Desactivamos la protección CSRF para estas rutas
  skip_before_action :verify_authenticity_token
  skip_before_action :authenticate_user! # Si tienes autenticación

  layout false

  def manifest
    # Configuramos el content-type correctamente
    response.headers["Content-Type"] = "application/manifest+json"

    # Renderizamos JSON directamente
    render json: {
      name: "AES Fire Inspections",
      short_name: "AES Fire Inspections",
      description: "Aplication for fire inspections",
      start_url: "/",
      display: "standalone",
      scope: "/",
      background_color: "#0f172a",
      theme_color: "#1e293b",
      orientation: "portrait",
      categories: %w[business productivity],
      icons: [
        {
          src: "/icon.png",
          type: "image/png",
          sizes: "100x100"
        },
        {
          src: "/icon_192.png",
          type: "image/png",
          sizes: "192x192"
        },
        {
          src: "/icon_512.png",
          type: "image/png",
          sizes: "512x512"
        },
        {
          src: "/icon_512.png",
          type: "image/png",
          sizes: "512x512",
          purpose: "any maskable"
        }
      ],
      screenshots: [
        {
          src: "/icon_512.png",
          type: "image/png",
          sizes: "512x512",
          form_factor: "narrow"
        },
        {
          src: "/icon_512.png",
          type: "image/png",
          sizes: "512x512",
          form_factor: "wide"
        }
      ]
    }
  end

  def service_worker
    # Configuramos el content-type correctamente
    response.headers["Content-Type"] = "application/javascript"

    # Lista de recursos críticos para cachear
    app_shell_urls = [
      "/",
      # IMPORTANTE: no incluir rutas protegidas que requieran sesión (evita cachear login)
      # '/inspections',
      # '/form_fills',
      view_context.asset_path("application.js"),
      view_context.asset_path("application.css"),
      "/icon.png",
      "/icon_192.png",
      "/icon_512.png"
    ]

    # Cache estática en producción, dinámica en desarrollo
    cache_version = if Rails.env.development?
                      # En desarrollo, usar versión fija para evitar updates constantes
                      "dev-1.0.0"
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

      // Patrones de URL para diferentes estrategias de cache
      const API_PATTERNS = [
        /\/api\//
      ];

      const STATIC_PATTERNS = [
        /\.css$/,
        /\.js$/,
        /\.png$/,
        /\.jpg$/,
        /\.jpeg$/,
        /\.svg$/,
        /\.ico$/
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

            // Cache de offline fallbacks
            caches.open(OFFLINE_CACHE_NAME).then(cache => {
              console.log('📱 Service Worker: Preparando recursos offline...');
              return cache.add(OFFLINE_FALLBACK_URL).catch(err => {
                console.warn('⚠️ No se pudo cachear offline.html:', err);
              });
            })
          ])
        );
      });

      // Activación del Service Worker
      self.addEventListener('activate', event => {
        console.log('✅ Service Worker: Activando...');
      #{'  '}
        event.waitUntil(
          Promise.all([
            // Limpiar caches antiguos
            caches.keys().then(cacheNames => {
              return Promise.all(
                cacheNames.map(cacheName => {
                  if (cacheName !== CACHE_NAME &&#{' '}
                      cacheName !== API_CACHE_NAME &&#{' '}
                      cacheName !== OFFLINE_CACHE_NAME) {
                    console.log('🗑️ Service Worker: Eliminando cache antiguo:', cacheName);
                    return caches.delete(cacheName);
                  }
                })
              );
            }),
      #{'      '}
            // Tomar control de todas las pestañas
            self.clients.claim()
          ])
        );
      });

      // Interceptar requests
      self.addEventListener('fetch', event => {
        const { request } = event;
        const url = new URL(request.url);

        // Solo manejar requests del mismo origen
        if (url.origin !== location.origin) {
          return;
        }

        // IMPORTANTE: No interceptar métodos no-GET (PATCH/POST/PUT/DELETE)
        // Deja que la red los maneje directamente para evitar errores y asegurar mutaciones.
        if (request.method !== 'GET') {
          return; // no llamar respondWith: deja pasar la request a la red
          // Alternativa explícita: event.respondWith(fetch(request)); return;
        }

        // Priorizar navegaciones (páginas HTML) para asegurar fallback offline
        if (request.mode === 'navigate') {
          event.respondWith(networkFirstWithOfflineFallback(request));
          return;
        }

        // Estrategia para recursos estáticos (CSS, JS, imágenes)
        if (STATIC_PATTERNS.some(pattern => pattern.test(url.pathname))) {
          event.respondWith(cacheFirstStrategy(request));
          return;
        }

        // Estrategia para API calls (solo /api/)
        if (API_PATTERNS.some(pattern => pattern.test(url.pathname))) {
          event.respondWith(networkFirstStrategy(request));
          return;
        }

        // Para todo lo demás, intentar red primero
        event.respondWith(networkFirstStrategy(request));
      });

      // Estrategia Cache First (para assets estáticos)
      async function cacheFirstStrategy(request) {
        try {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }

          const networkResponse = await fetch(request);
          if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          console.error('❌ Cache First falló:', error);
          return new Response('Recurso no disponible offline', { status: 503 });
        }
      }

      // Estrategia Network First (para contenido dinámico)
      async function networkFirstStrategy(request) {
        try {
          const networkResponse = await fetch(request);
      #{'    '}
          // Solo cachear requests GET exitosos
          if (networkResponse.ok && request.method === 'GET') {
            const cache = await caches.open(API_CACHE_NAME);
            cache.put(request, networkResponse.clone());
          }
      #{'    '}
          return networkResponse;
        } catch (error) {
          console.log('🔄 Red falló, buscando en cache:', request.url);
      #{'    '}
          // Solo buscar en cache para requests GET
          if (request.method === 'GET') {
            // Intentar coincidir ignorando Vary y diferencias del Request
            const urlForMatch = new URL(request.url);
            let cachedResponse = await caches.match(request, { ignoreVary: true });
            if (!cachedResponse) {
              cachedResponse = await caches.match(urlForMatch.pathname, { ignoreVary: true });
            }
            if (cachedResponse) {
              return cachedResponse;
            }
          }
      #{'    '}
          throw error;
        }
      }

      // Estrategia Network First con fallback offline para navegación
      async function networkFirstWithOfflineFallback(request) {
        try {
          const networkResponse = await fetch(request);
      #{'    '}
          // Solo cachear navegación GET exitosa
          if (networkResponse.ok && request.method === 'GET') {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
          }
      #{'    '}
          return networkResponse;
        } catch (error) {
          console.log('🔄 Navegación offline, buscando en cache:', request.url);
      #{'    '}
          // Intentar encontrar en cache solo para GET
          if (request.method === 'GET') {
            const urlForMatch = new URL(request.url);
            let cachedResponse = await caches.match(request, { ignoreVary: true });
            if (!cachedResponse) {
              cachedResponse = await caches.match(urlForMatch.pathname, { ignoreVary: true });
            }
            if (cachedResponse) {
              return cachedResponse;
            }
          }
      #{'    '}
          // Fallback a página offline para navegación
          if (request.mode === 'navigate') {
            const offlineResponse = await caches.match(OFFLINE_FALLBACK_URL, { ignoreVary: true });
            if (offlineResponse) {
              return offlineResponse;
            }
          }
      #{'    '}
          throw error;
        }
      }

      // Manejo de mensajes desde la aplicación
      self.addEventListener('message', event => {
        const data = event.data || {};
        if (data.type === 'SKIP_WAITING') {
          self.skipWaiting();
          return;
        }
      #{'  '}
        // Permite precachear páginas específicas (show de inspecciones y form_fills, etc.)
        if (data.type === 'PRECACHE_URLS' && Array.isArray(data.urls)) {
          event.waitUntil((async () => {
            try {
              const cache = await caches.open(CACHE_NAME);
              for (const url of data.urls) {
                try {
                  const req = new Request(url, { method: 'GET', credentials: 'same-origin' });
                  const resp = await fetch(req);
                  if (resp.ok) {
                    await cache.put(req, resp.clone());
                    console.log('🧩 SW: Precached', url);
                  } else {
                    console.warn('⚠️ SW: Fetch failed for', url, resp.status);
                  }
                } catch (e) {
                  console.warn('⚠️ SW: Error precaching', url, e);
                }
              }
            } catch (e) {
              console.warn('⚠️ SW: PRECACHE_URLS failed:', e);
            }
          })());
        }

        // Permite eliminar URLs específicas del caché (limpieza de inspecciones offline)
        if (data.type === 'CLEANUP_URLS' && Array.isArray(data.urls)) {
          event.waitUntil((async () => {
            try {
              const cache = await caches.open(CACHE_NAME);
              for (const url of data.urls) {
                try {
                  // Intentar borrar la URL tal cual y también con la query string predeterminada si existe
                  // (Service Worker match a veces es estricto con query params)
                  const deleted = await cache.delete(url, { ignoreSearch: true });
                   if (deleted) console.log('🗑️ SW: Deleted from cache', url);
                   else console.log('ℹ️ SW: URL not found in cache to delete', url);
                 } catch (e) {
                   console.warn('⚠️ SW: Error deleting', url, e);
                 }
               }
               // Confirmar finalización si se proporcionó un puerto de mensaje
               if (event.ports && event.ports[0]) {
                 event.ports[0].postMessage({ done: true });
               }
             } catch (e) {
               console.warn('⚠️ SW: CLEANUP_URLS failed:', e);
               if (event.ports && event.ports[0]) {
                 event.ports[0].postMessage({ done: true, error: e.message });
               }
             }
           })());
         }

         // Limpieza total de cachés (Clean All)
         if (data.type === 'CLEAR_ALL_CACHE') {
           event.waitUntil((async () => {
             try {
               const keys = await caches.keys();
               await Promise.all(keys.map(async key => {
                 if (key === CACHE_NAME) {
                   // Limpiar datos de usuario del caché principal, preservando App Shell
                   console.log('🧹 SW: Cleaning user data from App Shell cache...');
                   const cache = await caches.open(key);
                   const requests = await cache.keys();
                   await Promise.all(requests.map(req => {
                     const url = new URL(req.url);
                     const pathname = url.pathname;
      #{'               '}
                     // Verificar si es parte del App Shell
                     const isAppShell = APP_SHELL_URLS.some(shellUrl => pathname === shellUrl);

                     if (!isAppShell) {
                       // Borrar todo lo que no sea App Shell (inspecciones visitadas, fotos cacheadas, etc)
                       return cache.delete(req);
                     }
                     return Promise.resolve();
                   }));
                   console.log('🛡️ SW: App Shell preserved in', key);
                 } else if (key === OFFLINE_CACHE_NAME) {
                   console.log('🛡️ SW: Preserving Offline Page cache', key);
                   return Promise.resolve();
                 } else {
                   // Borrar otros cachés (API, versiones viejas)
                   console.log('🗑️ SW: Deleting cache', key);
                   return caches.delete(key);
                 }
               }));
      #{'         '}
               console.log('🗑️ SW: User data caches cleared');
               if (event.ports && event.ports[0]) {
                 event.ports[0].postMessage({ done: true });
               }
             } catch (e) {
               console.warn('⚠️ SW: CLEAR_ALL_CACHE failed:', e);
               if (event.ports && event.ports[0]) {
                 event.ports[0].postMessage({ done: true, error: e.message });
               }
             }
           })());
         }
       });

      console.log('🚀 Service Worker cargado correctamente - v#{cache_version}');
    JAVASCRIPT

    render plain: js_content
  end
end
