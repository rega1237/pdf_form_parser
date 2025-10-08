import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["input", "preview", "status", "uploadButton", "removeButton"];
  static values = { 
    photoId: String,
    formFillId: String,
    fieldName: String
  };

  connect() {
    this.isOnline = navigator.onLine;
    
    // Escuchar cambios de conectividad
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));
    
    // Inicializar almacenamiento offline
    this.initializeOfflineStorage();
    
    // Actualizar estado inicial
    this.updateStatus();
  }

  async initializeOfflineStorage() {
    // Wait for OfflineStorage to be available (loaded via importmap)
    if (typeof OfflineStorage === 'undefined') {
      // If not available yet, wait and retry
      setTimeout(() => this.initializeOfflineStorage(), 100);
      return;
    }
    
    this.storage = new OfflineStorage();
    await this.loadExistingPhoto();
  }

  disconnect() {
    window.removeEventListener('online', this.handleOnline.bind(this));
    window.removeEventListener('offline', this.handleOffline.bind(this));
  }

  /**
   * Maneja la selección de archivos
   */
  async handleFileSelect(event) {
    const file = event.target.files[0]
    
    if (!file) {
      return
    }

    try {
      // Validar archivo
      if (!this.validateFile(file)) {
        return
      }

      this.updateStatus('Procesando foto...', 'info')
      
      // Generar ID único para la foto
      const photoId = this.generatePhotoId()
      
      // Almacenar foto offline
      await this.storePhotoOffline(photoId, file)
      
      // Actualizar preview
      await this.updatePreview(photoId)
      
      // Actualizar estado del formulario
      this.updateFormData(photoId)
      
      this.updateStatus('Foto guardada offline', 'success')
      
    } catch (error) {
      console.error('[OfflinePhoto] Error handling file:', error)
      this.updateStatus('Error al procesar la foto', 'error')
    }
  }

  /**
   * Valida el archivo seleccionado
   */
  validateFile(file) {
    // Verificar tipo
    if (!this.acceptedTypesValue.includes(file.type)) {
      this.updateStatus(`Tipo de archivo no válido. Use: ${this.acceptedTypesValue.join(', ')}`, 'error')
      return false
    }

    // Verificar tamaño
    if (file.size > this.maxSizeValue) {
      const maxSizeMB = (this.maxSizeValue / 1024 / 1024).toFixed(1)
      this.updateStatus(`Archivo muy grande. Máximo: ${maxSizeMB}MB`, 'error')
      return false
    }

    return true
  }

  /**
   * Almacena la foto en IndexedDB
   */
  async storePhotoOffline(photoId, file) {
    const metadata = {
      form_fill_id: this.formFillIdValue,
      field_name: this.fieldNameValue,
      filename: file.name,
      size: file.size,
      type: file.type,
      uploaded_at: new Date().toISOString(),
      synced: false
    }

    await this.offlineStorage.storePhotoFromFile(photoId, file, metadata)
    this.photoIdValue = photoId
  }

  /**
   * Actualiza el preview de la foto
   */
  async updatePreview(photoId) {
    if (!this.hasPreviewTarget) return

    try {
      // Limpiar URL anterior
      if (this.currentPhotoURL) {
        URL.revokeObjectURL(this.currentPhotoURL)
      }

      // Crear nueva URL
      this.currentPhotoURL = await this.offlineStorage.createPhotoURL(photoId)
      
      if (this.currentPhotoURL) {
        this.previewTarget.src = this.currentPhotoURL
        this.previewTarget.style.display = 'block'
        
        if (this.hasRemoveButtonTarget) {
          this.removeButtonTarget.style.display = 'inline-block'
        }
      }
    } catch (error) {
      console.error('[OfflinePhoto] Error updating preview:', error)
    }
  }

  /**
   * Carga foto existente si existe
   */
  async loadExistingPhoto() {
    if (!this.photoIdValue) return

    try {
      const hasPhoto = await this.offlineStorage.hasPhotoBlob(this.photoIdValue)
      
      if (hasPhoto) {
        await this.updatePreview(this.photoIdValue)
        this.updateStatus('Foto cargada desde almacenamiento offline', 'info')
      }
    } catch (error) {
      console.error('[OfflinePhoto] Error loading existing photo:', error)
    }
  }

  /**
   * Elimina la foto
   */
  async removePhoto() {
    if (!this.photoIdValue) return

    try {
      this.updateStatus('Eliminando foto...', 'info')
      
      // Eliminar de IndexedDB
      await this.offlineStorage.removePhotoBlob(this.photoIdValue)
      
      // Limpiar preview
      if (this.hasPreviewTarget) {
        this.previewTarget.style.display = 'none'
        this.previewTarget.src = ''
      }
      
      if (this.hasRemoveButtonTarget) {
        this.removeButtonTarget.style.display = 'none'
      }
      
      // Limpiar URL temporal
      if (this.currentPhotoURL) {
        URL.revokeObjectURL(this.currentPhotoURL)
        this.currentPhotoURL = null
      }
      
      // Limpiar datos del formulario
      this.updateFormData(null)
      this.photoIdValue = ''
      
      this.updateStatus('Foto eliminada', 'success')
      
    } catch (error) {
      console.error('[OfflinePhoto] Error removing photo:', error)
      this.updateStatus('Error al eliminar la foto', 'error')
    }
  }

  /**
   * Sincroniza la foto con el servidor
   */
  async syncPhoto() {
    if (!this.photoIdValue || !navigator.onLine) {
      this.updateStatus('Sin conexión para sincronizar', 'error')
      return
    }

    try {
      this.updateStatus('Sincronizando foto...', 'info')
      
      const photoData = await this.offlineStorage.getPhotoBlob(this.photoIdValue)
      
      if (!photoData) {
        this.updateStatus('Foto no encontrada', 'error')
        return
      }

      // Crear FormData para envío
      const formData = new FormData()
      formData.append('photo', photoData.blob, photoData.metadata.filename)
      formData.append('form_fill_id', this.formFillIdValue)
      formData.append('field_name', this.fieldNameValue)

      // Enviar al servidor
      const response = await fetch('/api/v1/photos', {
        method: 'POST',
        body: formData,
        headers: {
          'X-CSRF-Token': document.querySelector('[name="csrf-token"]').content
        }
      })

      if (response.ok) {
        const result = await response.json()
        
        // Marcar como sincronizada
        photoData.metadata.synced = true
        photoData.metadata.server_id = result.id
        await this.offlineStorage.storePhotoBlob(this.photoIdValue, photoData.blob, photoData.metadata)
        
        this.updateStatus('Foto sincronizada correctamente', 'success')
      } else {
        throw new Error(`Error del servidor: ${response.status}`)
      }
      
    } catch (error) {
      console.error('[OfflinePhoto] Error syncing photo:', error)
      this.updateStatus('Error al sincronizar la foto', 'error')
    }
  }

  /**
   * Actualiza los datos del formulario
   */
  updateFormData(photoId) {
    // Disparar evento personalizado para notificar cambios
    const event = new CustomEvent('photo-changed', {
      detail: {
        fieldName: this.fieldNameValue,
        photoId: photoId,
        formFillId: this.formFillIdValue
      }
    })
    
    this.element.dispatchEvent(event)
  }

  /**
   * Actualiza el estado de conectividad
   */
  updateOnlineStatus() {
    const isOnline = navigator.onLine
    
    if (this.hasUploadButtonTarget) {
      this.uploadButtonTarget.disabled = !isOnline
      this.uploadButtonTarget.title = isOnline ? 'Subir foto' : 'Sin conexión'
    }
  }

  /**
   * Actualiza el mensaje de estado
   */
  updateStatus(message, type = 'info') {
    if (!this.hasStatusTarget) return

    this.statusTarget.textContent = message
    this.statusTarget.className = `photo-status photo-status--${type}`
    
    // Auto-ocultar después de 3 segundos para mensajes de éxito/info
    if (type === 'success' || type === 'info') {
      setTimeout(() => {
        if (this.hasStatusTarget) {
          this.statusTarget.textContent = ''
          this.statusTarget.className = 'photo-status'
        }
      }, 3000)
    }
  }

  /**
   * Genera un ID único para la foto
   */
  generatePhotoId() {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substr(2, 9)
    return `photo_${this.formFillIdValue}_${this.fieldNameValue}_${timestamp}_${random}`
  }
}