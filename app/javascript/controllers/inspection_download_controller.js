import { Controller } from "@hotwired/stimulus"

console.log("[InspectionDownload] File loaded");

// OfflineStorage is now available globally via importmap
export default class extends Controller {
  static targets = ["downloadButton", "progressContainer", "progressBar", "progressText", "statusIcon"]
  static values = { 
    inspectionId: Number,
    inspectionTitle: String 
  }

  connect() {
    console.log("[InspectionDownload] Controller connected");
    this.initializeOfflineStorage()
  }

  async initializeOfflineStorage() {
    console.log('[InspectionDownload] Checking for OfflineStorage...');
    if (typeof OfflineStorage === 'undefined') {
      console.log('[InspectionDownload] OfflineStorage not found, retrying in 100ms...');
      // If not available yet, wait and retry
      setTimeout(() => this.initializeOfflineStorage(), 100)
      return
    }
    
    console.log('[InspectionDownload] OfflineStorage found, initializing...');
    this.offlineStorage = new OfflineStorage()
    await this.updateDownloadStatus()
    console.log('[InspectionDownload] Initialization complete.');
  }

  async updateDownloadStatus() {
    try {
      console.log(`[InspectionDownload] Checking download status for inspection ${this.inspectionIdValue}`)
      const isDownloaded = await this.offlineStorage.hasInspection(this.inspectionIdValue)
      
      console.log(`[InspectionDownload] Is downloaded result:`, isDownloaded)
      
      if (isDownloaded) {
        console.log(`[InspectionDownload] Showing downloaded state`)
        this.showDownloadedState()
      } else {
        console.log(`[InspectionDownload] Showing not downloaded state`)
        this.showNotDownloadedState()
      }
    } catch (error) {
      console.error('Error checking download status:', error)
      this.showErrorState()
    }
  }

  async downloadInspection() {
    if (!navigator.onLine) {
      this.showMessage('No hay conexión a internet', 'error')
      return
    }

    try {
      this.showDownloadingState()
      
      // Realizar la descarga desde la API
      const response = await fetch(`/api/v1/inspections/${this.inspectionIdValue}/offline_data`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-CSRF-Token': document.querySelector('[name="csrf-token"]').content
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      
      if (result.success) {
        // Almacenar los datos en IndexedDB
        await this.offlineStorage.storeInspection(result.data)
        
        // Solicitar al Service Worker que precachee las páginas HTML críticas
        await this.precacheInspectionPages(result.data)
        
        this.showDownloadedState()
        this.showMessage('Inspection downloaded successfully', 'success')
        
        // Disparar evento personalizado para notificar a otros componentes
        this.dispatch('downloaded', { 
          detail: { 
            inspectionId: this.inspectionIdValue,
            inspectionTitle: this.inspectionTitleValue 
          } 
        })
        
      } else {
        throw new Error(result.message || 'Error desconocido')
      }
      
    } catch (error) {
      console.error('Error downloading inspection:', error)
      this.showErrorState()
      this.showMessage(`Error downloading: ${error.message}`, 'error')
    }
  }

  // ---- NUEVO: precachear páginas HTML críticas para navegación offline consistente ----
  async precacheInspectionPages(inspectionData) {
    try {
      if (!('serviceWorker' in navigator)) {
        console.warn('[InspectionDownload] Service Worker no soportado en este navegador')
        return
      }

      const inspectionId = inspectionData?.inspection?.id
      const formFills = Array.isArray(inspectionData?.form_fills) ? inspectionData.form_fills : []
      const urls = []

      if (inspectionId) urls.push(`/inspections/${inspectionId}`)
      for (const ff of formFills) {
        if (ff?.id) urls.push(`/form_fills/${ff.id}`)
      }

      if (urls.length === 0) {
        console.log('[InspectionDownload] No hay URLs para precachear')
        return
      }

      // Enviar mensaje al SW activo (o al controlador) para que precachee
      const registration = await navigator.serviceWorker.getRegistration()
      const target = registration?.active || navigator.serviceWorker.controller
      if (target) {
        target.postMessage({ type: 'PRECACHE_URLS', urls })
        console.log('[InspectionDownload] Solicitud de precache enviada al SW:', urls)
      } else {
        console.warn('[InspectionDownload] No hay SW activo para precachear')
      }
    } catch (e) {
      console.warn('[InspectionDownload] Error solicitando precache al SW:', e)
    }
  }

  async removeInspection() {
    try {
      this.showRemovingState()
      
      // Remover de IndexedDB
      await this.offlineStorage.removeInspection(this.inspectionIdValue)
      
      this.showNotDownloadedState()
      this.showMessage('Inspection removed from offline storage', 'success')
      
      // Disparar evento personalizado
      this.dispatch('removed', { 
        detail: { 
          inspectionId: this.inspectionIdValue,
          inspectionTitle: this.inspectionTitleValue 
        } 
      })
      
    } catch (error) {
      console.error('Error removing inspection:', error)
      this.showErrorState()
      this.showMessage(`Error al remover: ${error.message}`, 'error')
    }
  }

  showDownloadingState() {
    if (this.hasDownloadButtonTarget) {
      this.downloadButtonTarget.disabled = true
      this.downloadButtonTarget.innerHTML = `
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Downloading...
      `
    }
    
    if (this.hasProgressContainerTarget) {
      this.progressContainerTarget.classList.remove('hidden')
    }
    if (this.hasProgressBarTarget) {
      this.progressBarTarget.style.width = '50%'
    }
    
    if (this.hasProgressTextTarget) {
      this.progressTextTarget.textContent = 'Downloading data...'
    }
  }

  showRemovingState() {
    if (this.hasDownloadButtonTarget) {
      this.downloadButtonTarget.disabled = true
      this.downloadButtonTarget.innerHTML = `
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Removing...
      `
    }
  }

  showDownloadedState() {
    if (this.hasDownloadButtonTarget) {
      this.downloadButtonTarget.disabled = false
      this.downloadButtonTarget.className = "inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
      this.downloadButtonTarget.innerHTML = `
        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
        </svg>
        Remove Offline
      `
      this.downloadButtonTarget.onclick = () => this.removeInspection()
    }
    
    if (this.hasStatusIconTarget) {
      this.statusIconTarget.innerHTML = `
        <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
      `
    }
    
    this.hideProgressBar()
  }

  showNotDownloadedState() {
    if (this.hasDownloadButtonTarget) {
      this.downloadButtonTarget.disabled = false
      this.downloadButtonTarget.className = "inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
      this.downloadButtonTarget.innerHTML = `
        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
        </svg>
        Download Offline
      `
      this.downloadButtonTarget.onclick = () => this.downloadInspection()
    }
    
    if (this.hasStatusIconTarget) {
      this.statusIconTarget.innerHTML = `
        <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"></path>
        </svg>
      `
    }
    
    this.hideProgressBar()
  }

  showErrorState() {
    if (this.hasDownloadButtonTarget) {
      this.downloadButtonTarget.disabled = false
      this.downloadButtonTarget.className = "inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
      this.downloadButtonTarget.innerHTML = `
        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
        </svg>
        Retry
      `
      this.downloadButtonTarget.onclick = () => this.downloadInspection()
    }
    
    if (this.hasStatusIconTarget) {
      this.statusIconTarget.innerHTML = `
        <svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
        </svg>
      `
    }
    
    this.hideProgressBar()
  }

  hideProgressBar() {
    if (this.hasProgressContainerTarget) {
      this.progressContainerTarget.classList.add('hidden')
    }
    
    if (this.hasProgressTextTarget) {
      this.progressTextTarget.textContent = ''
    }
  }

  showMessage(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div')
    notification.className = `fixed top-4 right-4 z-50 px-6 py-3 rounded-lg text-white font-medium transition-all duration-300 transform translate-x-full`
    
    // Set color based on type
    switch (type) {
      case 'success':
        notification.classList.add('bg-green-600')
        break
      case 'error':
        notification.classList.add('bg-red-600')
        break
      case 'info':
      default:
        notification.classList.add('bg-blue-600')
        break
    }
    
    notification.textContent = message
    document.body.appendChild(notification)
    
    // Animate in
    setTimeout(() => {
      notification.classList.remove('translate-x-full')
    }, 100)
    
    // Remove after 3 seconds
    setTimeout(() => {
      notification.classList.add('translate-x-full')
      setTimeout(() => {
        document.body.removeChild(notification)
      }, 300)
    }, 3000)
  }
}