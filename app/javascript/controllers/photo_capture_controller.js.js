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
      
      // Opcional: Auto-guardar la foto inmediatamente
      // this.autoSavePhoto(file)
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

  // Método para eliminar foto
  removePhoto() {
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
    
    console.log('Photo removed from preview')
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

  // Método opcional para auto-guardar foto (requiere integración con form-fill controller)
  autoSavePhoto(file) {
    // Obtener referencia al controlador form-fill
    const formFillController = this.application.getControllerForElementAndIdentifier(
      document.querySelector('[data-controller*="form-fill"]'), 
      'form-fill'
    )
    
    if (formFillController && typeof formFillController.saveDraft === 'function') {
      console.log('Auto-saving photo...')
      // Esperar un momento para que el archivo se registre en el formulario
      setTimeout(() => {
        formFillController.saveDraft()
      }, 100)
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

  // Método para mostrar estado de carga
  showLoadingState() {
    const button = this.element.querySelector('button')
    if (button) {
      const originalContent = button.innerHTML
      button.innerHTML = `
        <svg class="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Procesando...
      `
      button.disabled = true
      
      // Restaurar estado original después de 3 segundos
      setTimeout(() => {
        button.innerHTML = originalContent
        button.disabled = false
      }, 3000)
    }
  }
}