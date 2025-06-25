// app/javascript/controllers/photo_capture_controller.js
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["preview", "image"]
  static values = { inputId: String }

  connect() {
    // Buscar el input file asociado y agregar event listener
    this.fileInput = document.getElementById(this.inputIdValue)
    if (this.fileInput) {
      this.fileInput.addEventListener('change', this.handleFileChange.bind(this))
    }
  }

  disconnect() {
    // Limpiar event listener al desconectar
    if (this.fileInput) {
      this.fileInput.removeEventListener('change', this.handleFileChange.bind(this))
    }
  }

  // Método para abrir selector de archivos/cámara
  openCamera() {
    if (this.fileInput) {
      this.fileInput.click()
    } else {
      console.error(`File input with ID ${this.inputIdValue} not found`)
    }
  }

  // Método para manejar cambio de archivo
  handleFileChange(event) {
    const file = event.target.files[0]
    if (file) {
      // Validar que sea una imagen
      if (!file.type.startsWith('image/')) {
        alert('Por favor seleccione un archivo de imagen válido.')
        this.clearFileInput()
        return
      }

      // Validar tamaño del archivo (máximo 10MB)
      const maxSize = 10 * 1024 * 1024 // 10MB en bytes
      if (file.size > maxSize) {
        alert('El archivo es demasiado grande. Máximo permitido: 10MB.')
        this.clearFileInput()
        return
      }

      // Mostrar vista previa
      this.displayPhoto(file)
    }
  }

  // Método para mostrar vista previa de la foto
  displayPhoto(file) {
    if (!this.hasPreviewTarget || !this.hasImageTarget) {
      console.error('Preview or image targets not found')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      // Actualizar la imagen de vista previa
      this.imageTarget.src = e.target.result
      this.imageTarget.alt = `Preview of ${file.name}`
      
      // Mostrar el contenedor de vista previa
      this.previewTarget.classList.remove('hidden')
      
      // Agregar información del archivo
      this.updateFileInfo(file)
      
      console.log(`Photo preview displayed: ${file.name} (${this.formatFileSize(file.size)})`)
    }
    
    reader.onerror = () => {
      console.error('Error reading file for preview')
      alert('Error al leer el archivo. Por favor intente nuevamente.')
      this.clearFileInput()
    }
    
    reader.readAsDataURL(file)
  }

  // Método para actualizar información del archivo en la vista previa
  updateFileInfo(file) {
    const previewContainer = this.previewTarget
    let infoElement = previewContainer.querySelector('.file-info')
    
    if (!infoElement) {
      infoElement = document.createElement('div')
      infoElement.className = 'file-info text-xs text-slate-300 mt-2'
      previewContainer.appendChild(infoElement)
    }
    
    infoElement.innerHTML = `
      <div class="flex justify-between items-center">
        <span>${file.name}</span>
        <span>${this.formatFileSize(file.size)}</span>
      </div>
    `
  }

  // Método para formatear tamaño de archivo
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Método principal para eliminar foto (llamado desde la vista)
  removePhoto() {
    const fieldName = this.getFieldNameFromInput()
    const hasServerPhoto = this.hasServerPhoto()
    
    console.log('=== REMOVE PHOTO DEBUG ===')
    console.log('Field name extracted:', fieldName)
    console.log('Has server photo:', hasServerPhoto)
    console.log('========================')
    
    if (hasServerPhoto && fieldName) {
      // Hay foto en el servidor, eliminar completamente
      this.removePhotoCompletely(fieldName)
    } else {
      // Solo hay preview local, limpiar solo la vista
      this.clearPreviewOnly()
    }
  }

  // Método para eliminar foto completamente del servidor
  removePhotoCompletely(fieldName) {
    // Confirmar eliminación
    if (!confirm('¿Está seguro de que desea eliminar esta foto? Esta acción no se puede deshacer.')) {
      return
    }
    
    // Mostrar estado de carga
    this.showLoadingState()
    
    // Llamar al endpoint para eliminar la foto del servidor
    this.removePhotoFromServer(fieldName)
      .then(result => {
        if (result.success) {
          // Limpiar la vista previa
          this.clearPreviewAndInput()
          
          // Actualizar el botón
          this.updateButtonText('Tomar Foto')
          
          // Mostrar mensaje de éxito
          this.showSuccessMessage('Foto eliminada exitosamente')
          
          // Notificar al form_fill controller para actualizar la estructura
          this.notifyFormFillController()
          
        } else {
          alert(`Error al eliminar la foto: ${result.error}`)
        }
      })
      .catch(error => {
        console.error('Error removing photo:', error)
        alert('Error de conexión al eliminar la foto')
      })
      .finally(() => {
        // Restaurar estado del botón
        this.hideLoadingState()
      })
  }

  // Método para solo limpiar preview (foto no guardada aún)
  clearPreviewOnly() {
    // Limpiar el input file
    this.clearFileInput()
    
    // Ocultar vista previa
    if (this.hasPreviewTarget) {
      this.previewTarget.classList.add('hidden')
    }
    
    // Limpiar imagen
    if (this.hasImageTarget) {
      this.imageTarget.src = ''
      this.imageTarget.alt = ''
    }
    
    // Remover información del archivo
    const infoElement = this.previewTarget?.querySelector('.file-info')
    if (infoElement) {
      infoElement.remove()
    }
    
    console.log('Photo preview cleared (local only)')
  }

  // Método para eliminar foto del servidor
  async removePhotoFromServer(fieldName) {
    try {
      const formElement = document.querySelector('[data-controller*="form-fill"]')
      const formId = formElement.action.split('/').pop().split('?')[0]
      
      const response = await fetch(`/form_fills/${formId}/remove_photo`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.querySelector('[name="csrf-token"]').content,
        },
        body: JSON.stringify({
          field_name: fieldName
        })
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('Error in removePhotoFromServer:', error)
      throw error
    }
  }

  // Método para obtener el nombre del campo desde el input
  getFieldNameFromInput() {
    const fileInput = document.getElementById(this.inputIdValue)
    if (!fileInput) {
      console.error('File input not found:', this.inputIdValue)
      return null
    }
    
    const inputName = fileInput.name // form_fill[Field Name]
    const match = inputName.match(/form_fill\[(.+)\]/)
    const fieldName = match ? match[1] : null
    
    console.log('Field name extracted:', fieldName)
    return fieldName
  }

  // MÉTODO CORREGIDO: Verificar si hay foto guardada en el servidor
  hasServerPhoto() {
    if (!this.hasPreviewTarget) {
      console.log('No preview target found')
      return false
    }

    // Método 1: Buscar el indicador "Guardada" en el texto
    const fileInfoElement = this.previewTarget.querySelector('.file-info')
    if (fileInfoElement) {
      const guardadaText = fileInfoElement.textContent.includes('Guardada')
      console.log('Method 1 - Found "Guardada" text:', guardadaText)
      if (guardadaText) return true
    }

    // Método 2: Buscar elementos con class text-green-400 que contengan "Guardada"
    const greenElements = this.previewTarget.querySelectorAll('.text-green-400')
    for (let element of greenElements) {
      if (element.textContent.includes('Guardada')) {
        console.log('Method 2 - Found green element with "Guardada":', true)
        return true
      }
    }

    // Método 3: Verificar si la imagen tiene src que no está vacío y no es data: URL
    if (this.hasImageTarget && this.imageTarget.src) {
      const isDataUrl = this.imageTarget.src.startsWith('data:')
      const hasValidSrc = this.imageTarget.src.length > 0 && !isDataUrl
      console.log('Method 3 - Has valid image src (not data URL):', hasValidSrc)
      
      // Si tiene src válido pero no es data URL, probablemente es del servidor
      if (hasValidSrc) {
        // Verificar también que no esté oculto el preview
        const isVisible = !this.previewTarget.classList.contains('hidden')
        console.log('Method 3 - Preview is visible:', isVisible)
        return isVisible
      }
    }

    // Método 4: Verificar desde la estructura del formulario
    const fieldName = this.getFieldNameFromInput()
    if (fieldName) {
      const hasAttachmentId = this.checkFormStructureForPhoto(fieldName)
      console.log('Method 4 - Has attachment ID in structure:', hasAttachmentId)
      if (hasAttachmentId) return true
    }

    console.log('Has server photo: false (all methods)')
    return false
  }

  // Nuevo método para verificar la estructura del formulario
  checkFormStructureForPhoto(fieldName) {
    try {
      const formFillElement = document.querySelector('[data-controller*="form-fill"]')
      if (!formFillElement) return false

      const structureValue = formFillElement.dataset.formFillFormStructureValue
      if (!structureValue) return false

      const structure = JSON.parse(structureValue)
      const field = structure.find(f => f.name === fieldName && f.type === 'Photo')
      
      return field && field.photo_attachment_id && field.photo_attachment_id.trim() !== ''
    } catch (error) {
      console.error('Error checking form structure:', error)
      return false
    }
  }

  // Método para limpiar vista previa e input
  clearPreviewAndInput() {
    // Limpiar el input file
    this.clearFileInput()
    
    // Ocultar vista previa
    if (this.hasPreviewTarget) {
      this.previewTarget.classList.add('hidden')
    }
    
    // Limpiar imagen
    if (this.hasImageTarget) {
      this.imageTarget.src = ''
      this.imageTarget.alt = ''
    }
    
    // Remover información del archivo
    const infoElement = this.previewTarget?.querySelector('.file-info')
    if (infoElement) {
      infoElement.remove()
    }
    
    console.log('Photo preview and input cleared')
  }

  // Método para limpiar el input file
  clearFileInput() {
    if (this.fileInput) {
      this.fileInput.value = ''
      
      // Disparar evento de cambio para notificar a otros controladores
      const changeEvent = new Event('change', { bubbles: true })
      this.fileInput.dispatchEvent(changeEvent)
    }
  }

  // Método para actualizar texto del botón
  updateButtonText(newText) {
    const button = this.element.querySelector('button span')
    if (button) {
      button.textContent = newText
    }
  }

  // Método para mostrar mensaje de éxito
  showSuccessMessage(message) {
    // Crear mensaje temporal
    const notification = document.createElement('div')
    notification.className = 'fixed top-4 right-4 z-50 px-4 py-2 bg-green-500 text-white rounded-lg shadow-lg'
    notification.textContent = message
    
    document.body.appendChild(notification)
    
    // Remover después de 3 segundos
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove()
      }
    }, 3000)
  }

  // Método para notificar al form_fill controller
  notifyFormFillController() {
    // Buscar el controlador form-fill y recargar la estructura
    const formFillElement = document.querySelector('[data-controller*="form-fill"]')
    if (formFillElement && formFillElement.formFillController) {
      formFillElement.formFillController.reloadFormStructure()
    } else {
      // Fallback: recargar la página después de un momento
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    }
  }

  // Método para mostrar estado de carga
  showLoadingState() {
    const button = this.element.querySelector('button')
    if (button) {
      this.originalButtonContent = button.innerHTML
      button.innerHTML = `
        <svg class="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Procesando...
      `
      button.disabled = true
    }
  }

  // Método para ocultar estado de carga
  hideLoadingState() {
    const button = this.element.querySelector('button')
    if (button && this.originalButtonContent) {
      button.innerHTML = this.originalButtonContent
      button.disabled = false
    }
  }

  // Método para cargar foto existente (llamado desde form-fill controller)
  loadExistingPhoto(imageSrc, fileName = 'Existing photo') {
    if (!this.hasPreviewTarget || !this.hasImageTarget) {
      console.error('Preview or image targets not found for loading existing photo')
      return
    }

    this.imageTarget.src = imageSrc
    this.imageTarget.alt = fileName
    this.previewTarget.classList.remove('hidden')
    
    // Agregar indicador de que es una foto existente
    let infoElement = this.previewTarget.querySelector('.file-info')
    if (!infoElement) {
      infoElement = document.createElement('div')
      infoElement.className = 'file-info text-xs text-slate-300 mt-2'
      this.previewTarget.appendChild(infoElement)
    }
    
    infoElement.innerHTML = `
      <div class="flex justify-between items-center">
        <span class="flex items-center">
          <svg class="w-3 h-3 mr-1 text-green-400" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
          </svg>
          ${fileName}
        </span>
        <span class="text-green-400">Guardada</span>
      </div>
    `
    
    console.log(`Existing photo loaded: ${fileName}`)
  }

  // Método de debug
  debugRemovePhoto() {
    console.log('=== DEBUG REMOVE PHOTO ===')
    console.log('Input ID value:', this.inputIdValue)
    console.log('Has preview target:', this.hasPreviewTarget)
    console.log('Has image target:', this.hasImageTarget)
    
    const fieldName = this.getFieldNameFromInput()
    console.log('Field name:', fieldName)
    
    const hasServerPhoto = this.hasServerPhoto()
    console.log('Has server photo:', hasServerPhoto)
    
    // Debug adicional para el método hasServerPhoto
    if (this.hasPreviewTarget) {
      const fileInfoElement = this.previewTarget.querySelector('.file-info')
      console.log('File info element found:', !!fileInfoElement)
      if (fileInfoElement) {
        console.log('File info text content:', fileInfoElement.textContent)
      }

      const greenElements = this.previewTarget.querySelectorAll('.text-green-400')
      console.log('Green elements found:', greenElements.length)
      greenElements.forEach((el, i) => {
        console.log(`Green element ${i}:`, el.textContent)
      })

      if (this.hasImageTarget) {
        console.log('Image src:', this.imageTarget.src)
        console.log('Image src is data URL:', this.imageTarget.src.startsWith('data:'))
      }
    }
    
    console.log('=== END DEBUG ===')
  }
}