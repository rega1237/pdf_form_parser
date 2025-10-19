import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["installButton", "updateButton"]

  connect() {
    console.log("[PWA Controller] PWA Controller connected")
    this.registerServiceWorker()
    this.setupInstallPrompt()
    
    // Mostrar botón de instalación temporalmente para pruebas
    setTimeout(() => {
      this.showInstallButton()
      console.log("[PWA Controller] Install button shown for testing")
    }, 2000)
  }

  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        // Registrar Service Worker desde la raíz
        const registration = await navigator.serviceWorker.register('/service-worker.js', {
          scope: '/'
        })
        
        console.log('[PWA Controller] Service Worker registered successfully:', registration)
        
        // Escuchar actualizaciones
        registration.addEventListener('updatefound', () => {
          console.log('[PWA Controller] Service Worker update found')
          this.handleServiceWorkerUpdate(registration)
        })

        // Verificar si hay una actualización esperando
        if (registration.waiting) {
          this.showUpdateButton()
        }

      } catch (error) {
        console.error('[PWA Controller] Service Worker registration failed', error)
      }
    } else {
      console.warn('[PWA Controller] Service Workers not supported')
    }
  }

  setupInstallPrompt() {
    let deferredPrompt = null

    window.addEventListener('beforeinstallprompt', (e) => {
      console.log('[PWA Controller] Install prompt available')
      e.preventDefault()
      deferredPrompt = e
      this.showInstallButton()
    })

    // Manejar instalación exitosa
    window.addEventListener('appinstalled', () => {
      console.log('[PWA Controller] App installed successfully')
      this.hideInstallButton()
      deferredPrompt = null
    })

    // Guardar referencia para uso posterior
    this.deferredPrompt = deferredPrompt
  }

  async install() {
    console.log('[PWA Controller] Install button clicked')
    console.log('[PWA Controller] deferredPrompt available:', !!this.deferredPrompt)
    
    if (this.deferredPrompt) {
      try {
        console.log('[PWA Controller] Showing install prompt')
        this.deferredPrompt.prompt()
        const { outcome } = await this.deferredPrompt.userChoice
        
        console.log('[PWA Controller] User choice:', outcome)
        if (outcome === 'accepted') {
          console.log('[PWA Controller] User accepted install prompt')
        } else {
          console.log('[PWA Controller] User dismissed install prompt')
        }
        
        this.deferredPrompt = null
        this.hideInstallButton()
      } catch (error) {
        console.error('[PWA Controller] Error during install:', error)
      }
    } else {
      console.log('[PWA Controller] No deferred prompt available')
      // Fallback: mostrar instrucciones al usuario
      alert('Para instalar la app:\n\n1. En Chrome: Menú (⋮) > "Instalar AES PRO"\n2. En Safari: Compartir > "Añadir a pantalla de inicio"\n3. En Firefox: Menú > "Instalar"')
    }
  }

  async updateApp() {
    const registration = await navigator.serviceWorker.getRegistration()
    
    if (registration && registration.waiting) {
      // Enviar mensaje al service worker para que se active
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      
      // Recargar la página cuando el nuevo SW tome control
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload()
      })
    }
  }

  // Alias para compatibilidad con data-action="click->pwa#updateServiceWorker"
  async updateServiceWorker() {
    return this.updateApp()
  }

  handleServiceWorkerUpdate(registration) {
    const newWorker = registration.installing
    
    newWorker.addEventListener('statechange', () => {
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        console.log('[PWA Controller] New Service Worker installed, update available')
        this.showUpdateButton()
      }
    })
  }

  showInstallButton() {
    if (this.hasInstallButtonTarget) {
      this.installButtonTarget.classList.remove('hidden')
    }
  }

  hideInstallButton() {
    if (this.hasInstallButtonTarget) {
      this.installButtonTarget.classList.add('hidden')
    }
  }

  showUpdateButton() {
    if (this.hasUpdateButtonTarget) {
      this.updateButtonTarget.classList.remove('hidden')
    }
  }

  hideUpdateButton() {
    if (this.hasUpdateButtonTarget) {
      this.updateButtonTarget.classList.add('hidden')
    }
  }
}