import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["input", "preview", "status", "uploadButton", "removeButton"];
  static values = {
    photoId: String,
    formFillId: String,
    fieldName: String,
    // Valores opcionales para validación; si no vienen, usar defaults
    acceptedTypes: Array,
    maxSize: Number
  };

  connect() {
    this.isOnline = navigator.onLine;

    // Vincular handlers para poder desregistrarlos correctamente en disconnect
    this.handleOnlineBound = this.handleOnline.bind(this);
    this.handleOfflineBound = this.handleOffline.bind(this);

    // Escuchar cambios de conectividad
    window.addEventListener('online', this.handleOnlineBound);
    window.addEventListener('offline', this.handleOfflineBound);

    // Inicializar almacenamiento offline
    this.initializeOfflineStorage();

    // Reflejar estado inicial en UI
    this.updateOnlineStatus();
  }

  async initializeOfflineStorage() {
    // Esperar a que OfflineStorage esté disponible (cargado vía importmap)
    if (typeof OfflineStorage === 'undefined') {
      setTimeout(() => this.initializeOfflineStorage(), 100);
      return;
    }

    // Usar una propiedad consistente en todo el controlador
    this.offlineStorage = new OfflineStorage();

    // Cargar foto existente (si corresponde)
    await this.loadExistingPhoto();

    // Intentar cargar la última foto offline guardada para este campo
    await this.loadLatestOfflinePhotoForField();
  }

  disconnect() {
    window.removeEventListener('online', this.handleOnlineBound);
    window.removeEventListener('offline', this.handleOfflineBound);
  }

  // Handlers de conectividad
  async handleOnline() {
    this.isOnline = true;
    this.updateOnlineStatus();
    this.updateStatus('Conectado', 'info');
    // Intentar sincronización automática si hay foto pendiente
    await this.tryAutoSync();
  }

  handleOffline() {
    this.isOnline = false;
    this.updateOnlineStatus();
    this.updateStatus('Sin conexión', 'error');
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
      // Validar archivo (con defaults si no se configuran en valores Stimulus)
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
    // Defaults si no hay configuración
    const accepted = Array.isArray(this.acceptedTypesValue) && this.acceptedTypesValue.length
      ? this.acceptedTypesValue
      : ['image/jpeg', 'image/jpg', 'image/png'];
    const maxSize = Number.isFinite(this.maxSizeValue) && this.maxSizeValue > 0
      ? this.maxSizeValue
      : 10 * 1024 * 1024; // 10MB

    // Verificar tipo
    if (!accepted.includes(file.type)) {
      this.updateStatus(`Tipo de archivo no válido. Use: ${accepted.join(', ')}`, 'error')
      return false
    }

    // Verificar tamaño
    if (file.size > maxSize) {
      const maxSizeMB = (maxSize / 1024 / 1024).toFixed(1)
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
    // Encontrar elementos de imagen y contenedor
    const imgEl = this.getPreviewImageElement();
    const containerEl = this.getPreviewContainerElement();
    if (!imgEl) return;

    try {
      // Limpiar URL anterior
      if (this.currentPhotoURL) {
        URL.revokeObjectURL(this.currentPhotoURL);
      }

      // Crear nueva URL
      this.currentPhotoURL = await this.offlineStorage.createPhotoURL(photoId);
      
      if (this.currentPhotoURL) {
        imgEl.src = this.currentPhotoURL;
        imgEl.alt = 'Captured photo';
        if (containerEl) {
          containerEl.classList.remove('hidden');
        }
        if (this.hasRemoveButtonTarget) {
          this.removeButtonTarget.style.display = 'inline-block';
        }
        // Actualizar info de archivo
        const infoEl = (containerEl || this.element).querySelector('.file-info');
        if (infoEl) {
          infoEl.innerHTML = `
            <div class="flex justify-between items-center">
              <span class="flex items-center">
                <svg class="w-3 h-3 mr-1 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
                </svg>
                Offline (pendiente)
              </span>
              <span class="text-yellow-400">Guardada offline</span>
            </div>
          `;
        }
      }
    } catch (error) {
      console.error('[OfflinePhoto] Error updating preview:', error);
    }
  }

  // Helpers para obtener elementos correctos de preview
  getPreviewImageElement() {
    // Buscar un IMG entre los targets de preview o por data-target
    const imgTarget = (this.previewTargets || []).find(el => el.tagName === 'IMG');
    return imgTarget || this.element.querySelector('img[data-offline-photo-target="preview"], img[data-photo-capture-target="image"]');
  }

  getPreviewContainerElement() {
    // Buscar el contenedor principal de preview
    const containerTarget = (this.previewTargets || []).find(el => el.tagName !== 'IMG');
    if (containerTarget) return containerTarget;
    // Fallback al contenedor del photo-capture
    const container = this.element.querySelector('[data-photo-capture-target="preview"]');
    return container || this.element;
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
   * Busca la última foto guardada offline para este form_fill y field
   */
  async loadLatestOfflinePhotoForField() {
    try {
      const allPhotos = await this.offlineStorage.getAllPhotoBlobs();
      const candidates = (allPhotos || []).filter(p => {
        const m = p.metadata || {};
        return String(m.form_fill_id) === String(this.formFillIdValue) && String(m.field_name) === String(this.fieldNameValue);
      });
      if (candidates.length === 0) return;
      // Ordenar por stored_at descendente
      candidates.sort((a, b) => new Date(b.metadata?.stored_at || 0) - new Date(a.metadata?.stored_at || 0));
      const latest = candidates[0];
      if (latest && latest.id) {
        this.photoIdValue = latest.id;
        await this.updatePreview(latest.id);
        this.updateStatus('Foto offline cargada para este campo', 'info');
      }
    } catch (error) {
      console.error('[OfflinePhoto] Error loading last offline photo:', error);
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
      
      // Limpiar preview y controles
      const imgEl = this.getPreviewImageElement()
      const containerEl = this.getPreviewContainerElement()
      if (imgEl) {
        imgEl.src = ''
      }
      if (containerEl) {
        containerEl.classList.add('hidden')
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
      this.updateStatus('Sin conexión para sincronizar', 'error');
      return;
    }

    try {
      this.updateStatus('Sincronizando foto...', 'info');
      const photoData = await this.offlineStorage.getPhotoBlob(this.photoIdValue);
      if (!photoData) {
        this.updateStatus('Foto no encontrada', 'error');
        return;
      }
      const formData = new FormData();
      formData.append('photo', photoData.blob, photoData.metadata.filename);
      formData.append('form_fill_id', this.formFillIdValue);
      formData.append('field_name', this.fieldNameValue);
      const response = await fetch('/api/v1/sync/upload_photo', {
        method: 'POST',
        body: formData,
        headers: { 'X-CSRF-Token': document.querySelector('[name="csrf-token"]').content }
      });
      const result = await response.json();
      if (response.ok && result.success) {
        // Marcar como sincronizada en metadata
        photoData.metadata.synced = true;
        photoData.metadata.photo_attachment_id = result.photo_attachment_id;
        await this.offlineStorage.storePhotoBlob(this.photoIdValue, photoData.blob, photoData.metadata);
        // Actualizar data column en el DOM para reflejar el attachment
        await this.updateDataColumnQuietly(result.photo_attachment_id, this.fieldNameValue);
        // Actualizar info visual a "Guardada"
        const containerEl = this.getPreviewContainerElement();
        const infoEl = (containerEl || this.element).querySelector('.file-info');
        if (infoEl) {
          infoEl.innerHTML = `
            <div class="flex justify-between items-center">
              <span class="flex items-center">
                <svg class="w-3 h-3 mr-1 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
                </svg>
                ${photoData.metadata.filename}
              </span>
              <span class="text-green-400">Guardada</span>
            </div>
          `;
        }
        this.updateStatus('Foto sincronizada correctamente', 'success');
      } else {
        throw new Error(result.error || `Error del servidor: ${response.status}`);
      }
    } catch (error) {
      console.error('[OfflinePhoto] Error syncing photo:', error);
      this.updateStatus('Error al sincronizar la foto', 'error');
    }
  }

  async tryAutoSync() {
    try {
      if (!this.photoIdValue) return;
      const photoData = await this.offlineStorage.getPhotoBlob(this.photoIdValue);
      if (photoData && photoData.metadata && photoData.metadata.synced === false) {
        await this.syncPhoto();
      }
    } catch (error) {
      console.error('[OfflinePhoto] Error in auto sync:', error);
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
   * Actualiza silenciosamente la columna de datos con el attachment id
   */
  async updateDataColumnQuietly(attachmentId, fieldName) {
    try {
      const formFillElement = document.querySelector('[data-controller*="form-fill"]');
      if (!formFillElement) return;
      const currentDataValue = formFillElement.dataset.formFillDataValue || '{}';
      let currentData = {};
      try { currentData = JSON.parse(currentDataValue); } catch(_) { currentData = {}; }
      const key = `${fieldName}_photo_attachment_id`;
      const updatedData = { ...currentData, [key]: attachmentId };
      formFillElement.dataset.formFillDataValue = JSON.stringify(updatedData);
    } catch (error) {
      console.warn('[OfflinePhoto] Error updating form fill data locally:', error);
    }
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

    this.statusTarget.textContent = message || ''
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