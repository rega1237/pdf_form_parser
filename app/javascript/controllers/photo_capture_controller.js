import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["preview", "image"];
  static values = { inputId: String };

  connect() {
    // Buscar el input file asociado y agregar event listener
    this.fileInput = document.getElementById(this.inputIdValue);
    if (this.fileInput) {
      this.fileInput.addEventListener(
        "change",
        this.handleFileChange.bind(this),
      );
    }
  }

  disconnect() {
    // Limpiar event listener al desconectar
    if (this.fileInput) {
      this.fileInput.removeEventListener(
        "change",
        this.handleFileChange.bind(this),
      );
    }
  }

  // Método para abrir selector de archivos/cámara
  openCamera() {
    // Si estamos offline, usar el input del controlador offline-photo para evitar intentos de subida
    if (!navigator.onLine) {
      const offlineInput = this.element.querySelector('input[data-offline-photo-target="input"]');
      if (offlineInput) {
        offlineInput.click();
        return;
      }
    }

    // Online: usar el input normal asociado a photo-capture
    if (this.fileInput) {
      this.fileInput.click();
    } else {
      console.error(`File input with ID ${this.inputIdValue} not found`);
    }
  }

  // Método para manejar cambio de archivo
  handleFileChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Si estamos offline, delega a offline-photo y no intentes subir
    if (!navigator.onLine) {
      // No mostramos preview aquí para evitar duplicados; offline-photo lo hará
      console.log('[PhotoCapture] Offline: se delega preview/almacenamiento al controlador offline-photo');
      return;
    }

    // Validar que sea una imagen
    if (!file.type.startsWith('image/')) {
      alert('Por favor seleccione un archivo de imagen válido.');
      this.clearFileInput();
      return;
    }

    // Validar tamaño del archivo (máximo 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB en bytes
    if (file.size > maxSize) {
      alert('El archivo es demasiado grande. Máximo permitido: 10MB.');
      this.clearFileInput();
      return;
    }

    // Mostrar vista previa y subir cuando estamos online
    this.displayPhoto(file);
  }

  // Método para mostrar vista previa de la foto
  displayPhoto(file) {
    if (!this.hasPreviewTarget || !this.hasImageTarget) {
      console.error("Preview or image targets not found");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      // Actualizar la imagen de vista previa
      this.imageTarget.src = e.target.result;
      this.imageTarget.alt = `Preview of ${file.name}`;

      // Mostrar el contenedor de vista previa
      this.previewTarget.classList.remove("hidden");

      // Agregar información del archivo
      this.updateFileInfo(file);

      console.log(
        `Photo preview displayed: ${file.name} (${this.formatFileSize(file.size)})`,
      );

      // subir la foto al servidor
      this.uploadPhotoToServer(file);
    };

    reader.onerror = () => {
      console.error("Error reading file for preview");
      alert("Error al leer el archivo. Por favor intente nuevamente.");
      this.clearFileInput();
    };

    reader.readAsDataURL(file);
  }

  // Método para actualizar información del archivo en la vista previa
  updateFileInfo(file) {
    const previewContainer = this.previewTarget;
    let infoElement = previewContainer.querySelector(".file-info");

    if (!infoElement) {
      infoElement = document.createElement("div");
      infoElement.className = "file-info text-xs text-slate-300 mt-2";
      previewContainer.appendChild(infoElement);
    }

    infoElement.innerHTML = `
      <div class="flex justify-between items-center">
        <span>${file.name}</span>
        <span>${this.formatFileSize(file.size)}</span>
      </div>
    `;
  }

  // Método para formatear tamaño de archivo
  formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  // Método principal para eliminar foto (llamado desde la vista)
  removePhoto() {
    const confirmMessage = "Are you sure you want to delete this photo? This action cannot be undone.";
    if (!confirm(confirmMessage)) return;

    const fieldName = this.getFieldNameFromInput();
    const hasServerPhoto = this.hasServerPhoto();

    // Si estamos offline, nunca intentes eliminar en servidor. Delega a offline.
    if (!navigator.onLine) {
      this.dispatchConfirmedRemove();
      this.clearPreviewOnly();
      return;
    }

    if (hasServerPhoto && fieldName) {
      // Hay foto en el servidor, eliminar completamente
      this.removePhotoCompletely(fieldName);
    } else {
      // Solo hay preview local: solicitar al controlador offline que borre la foto en IndexedDB
      this.dispatchConfirmedRemove();
      // Limpiar la vista por si no existe controlador offline
      this.clearPreviewOnly();
    }
  }

  // Método para eliminar foto completamente del servidor
  removePhotoCompletely(fieldName) {
    // Mostrar estado de carga
    this.showLoadingState();

    // Llamar al endpoint para eliminar la foto del servidor
    this.removePhotoFromServer(fieldName)
      .then((result) => {
        if (result.success) {
          // Limpiar la vista previa
          this.clearPreviewAndInput();

          // Actualizar el botón
          this.updateButtonText("Take Photo");

          // Mostrar mensaje de éxito
          this.showSuccessMessage("Photo deleted successfully");

          // También eliminar cualquier copia local (thumbnail/offline) una vez confirmada la eliminación
          this.dispatchConfirmedRemove();
        } else {
          alert(`Error deleting photo: ${result.error}`);
        }
      })
      .catch((error) => {
        console.error("Error removing photo:", error);
        alert("Connection error when deleting photo");
      })
      .finally(() => {
        // Restaurar estado del botón
        this.hideLoadingState();
      });
  }

  dispatchConfirmedRemove() {
    const evt = new CustomEvent('photo-remove-confirmed', { bubbles: true });
    this.element.dispatchEvent(evt);
  }

  // Método para solo limpiar preview (foto no guardada aún)
  clearPreviewOnly() {
    // Limpiar el input file
    this.clearFileInput();

    // Ocultar vista previa
    if (this.hasPreviewTarget) {
      this.previewTarget.classList.add("hidden");
    }

    // Limpiar imagen
    if (this.hasImageTarget) {
      this.imageTarget.src = "";
      this.imageTarget.alt = "";
    }

    // Remover información del archivo
    const infoElement = this.previewTarget?.querySelector(".file-info");
    if (infoElement) {
      infoElement.remove();
    }

    console.log("Photo preview cleared (local only)");
  }

  // Método para eliminar foto del servidor (updated for data column)
  async removePhotoFromServer(fieldName) {
    try {
      const formElement = document.querySelector(
        '[data-controller*="form-fill"]',
      );
      const formId = formElement.action.split("/").pop().split("?")[0];

      // Use the updated endpoint that clears data column entries
      const response = await fetch(`/form_fills/${formId}/remove_photo`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": document.querySelector('[name="csrf-token"]').content,
        },
        body: JSON.stringify({
          field_name: fieldName,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        // Update local data store to reflect photo removal
        await this.updateDataColumnQuietly(null, fieldName);
      }

      return result;
    } catch (error) {
      console.error("Error in removePhotoFromServer:", error);
      throw error;
    }
  }

  // Método para obtener el nombre del campo desde el input
  getFieldNameFromInput() {
    const fileInput = document.getElementById(this.inputIdValue);
    if (!fileInput) {
      console.error("File input not found:", this.inputIdValue);
      return null;
    }

    const inputName = fileInput.name; // form_fill[Field Name]
    const match = inputName.match(/form_fill\[(.+)\]/);
    const fieldName = match ? match[1] : null;

    return fieldName;
  }

  // Verificar si hay foto guardada en el servidor
  hasServerPhoto() {
    if (!this.hasPreviewTarget) {
      return false;
    }

    const fieldName = this.getFieldNameFromInput();

    // Primero: verificar por datos explícitos del formulario (attachment id en data column)
    if (fieldName) {
      const hasAttachmentId = this.checkFormStructureForPhoto(fieldName);
      if (hasAttachmentId) return true;
    }

    // Si estamos offline y no hay attachment id explícito, asumimos que NO hay foto de servidor
    if (!navigator.onLine) {
      return false;
    }

    // Método 1: Buscar el indicador "Guardada" en el texto
    const fileInfoElement = this.previewTarget.querySelector(".file-info");
    if (fileInfoElement) {
      const guardadaText = fileInfoElement.textContent.includes("Guardada") || fileInfoElement.textContent.includes("Saved");
      if (guardadaText) return true;
    }

    // Método 2: Buscar elementos con class text-green-400 que contengan "Guardada"
    const greenElements = this.previewTarget.querySelectorAll(".text-green-400");
    for (let element of greenElements) {
      if (element.textContent.includes("Guardada") || element.textContent.includes("Saved")) {
        return true;
      }
    }

    // Método 3: Verificar si la imagen tiene src de servidor (http/https o ruta) y NO es blob: ni data:
    if (this.hasImageTarget && this.imageTarget.src) {
      const src = this.imageTarget.src;
      const isDataUrl = src.startsWith("data:");
      const isBlobUrl = src.startsWith("blob:");
      const isHttpUrl = src.startsWith("http://") || src.startsWith("https://") || src.startsWith("/");
      const hasValidServerSrc = isHttpUrl && !isDataUrl && !isBlobUrl && src.length > 0;

      if (hasValidServerSrc) {
        const isVisible = !this.previewTarget.classList.contains("hidden");
        return isVisible;
      }
    }

    return false;
  }

  // método para verificar la data column para fotos
  checkFormStructureForPhoto(fieldName) {
    try {
      const formFillElement = document.querySelector('[data-controller*="form-fill"]');
      if (!formFillElement) return false;

      const dataValue = formFillElement.dataset.formFillDataValue;
      if (dataValue) {
        const data = JSON.parse(dataValue);
        // Preferir la clave moderna con sufijo _photo_attachment_id, con fallback a _attachment_id
        const keyNew = `${fieldName}_photo_attachment_id`;
        const keyOld = `${fieldName}_attachment_id`;
        const att = data[keyNew] ?? data[keyOld];
        if (att && String(att).trim() !== "") {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.warn("Error checking form structure for photo:", error);
      return false;
    }
  }

  // Método para limpiar vista previa e input
  clearPreviewAndInput() {
    // Limpiar el input file
    this.clearFileInput();

    // Ocultar vista previa
    if (this.hasPreviewTarget) {
      this.previewTarget.classList.add("hidden");
    }

    // Limpiar imagen
    if (this.hasImageTarget) {
      this.imageTarget.src = "";
      this.imageTarget.alt = "";
    }

    // Remover información del archivo
    const infoElement = this.previewTarget?.querySelector(".file-info");
    if (infoElement) {
      infoElement.remove();
    }

    console.log("Photo preview and input cleared");
  }

  // Método para limpiar el input file
  clearFileInput() {
    if (this.fileInput) {
      this.fileInput.value = "";

      // Disparar evento de cambio para notificar a otros controladores
      const changeEvent = new Event("change", { bubbles: true });
      this.fileInput.dispatchEvent(changeEvent);
    }
  }

  // Método para actualizar texto del botón
  updateButtonText(newText) {
    const button = this.element.querySelector("button span");
    if (button) {
      button.textContent = newText;
    }
  }

  // Método para mostrar mensaje de éxito
  showSuccessMessage(message) {
    // Crear mensaje temporal
    const notification = document.createElement("div");
    notification.className =
      "fixed top-4 right-4 z-50 px-4 py-2 bg-green-500 text-white rounded-lg shadow-lg";
    notification.textContent = message;

    document.body.appendChild(notification);

    // Remover después de 3 segundos
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 3000);
  }

  // Método para notificar al form_fill controller
  notifyFormFillController() {
    // Buscar el controlador form-fill y recargar la estructura
    const formFillElement = document.querySelector(
      '[data-controller*="form-fill"]',
    );
    if (formFillElement && formFillElement.formFillController) {
      formFillElement.formFillController.reloadFormStructure();
    } else {
      // Fallback: recargar la página después de un momento
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  }

  // Método para mostrar estado de carga
  showLoadingState() {
    const button = this.element.querySelector("button");
    if (button) {
      this.originalButtonContent = button.innerHTML;
      button.innerHTML = `
        <svg class="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Processing...
      `;
      button.disabled = true;
    }
  }

  // Método para ocultar estado de carga
  hideLoadingState() {
    const button = this.element.querySelector("button");
    if (button && this.originalButtonContent) {
      button.innerHTML = this.originalButtonContent;
      button.disabled = false;
    }
  }

  // Método para cargar foto existente (llamado desde form-fill controller)
  loadExistingPhoto(imageSrc, fileName = "Existing photo") {
    if (!this.hasPreviewTarget || !this.hasImageTarget) {
      console.error(
        "Preview or image targets not found for loading existing photo",
      );
      return;
    }

    this.imageTarget.src = imageSrc;
    this.imageTarget.alt = fileName;
    this.previewTarget.classList.remove("hidden");

    // Agregar indicador de que es una foto existente
    let infoElement = this.previewTarget.querySelector(".file-info");
    if (!infoElement) {
      infoElement = document.createElement("div");
      infoElement.className = "file-info text-xs text-slate-300 mt-2";
      this.previewTarget.appendChild(infoElement);
    }

    infoElement.innerHTML = `
      <div class="flex justify-between items-center">
        <span class="flex items-center">
          <svg class="w-3 h-3 mr-1 text-green-400" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
          </svg>
          ${fileName}
        </span>
        <span class="text-green-400">Saved</span>
      </div>
    `;

    console.log(`Existing photo loaded: ${fileName}`);
  }

  // Método para subir foto inmediatamente al servidor
  async uploadPhotoToServer(file) {
    const fieldName = this.getFieldNameFromInput();
    if (!fieldName) {
      console.error("Could not determine field name for photo upload");
      return;
    }

    try {
      // Mostrar estado de carga
      this.showUploadingState();

      // Obtener el ID del formulario
      const formElement = document.querySelector(
        '[data-controller*="form-fill"]',
      );
      if (!formElement) {
        throw new Error("Form element not found");
      }

      const formId = formElement.action.split("/").pop().split("?")[0];

      // Crear FormData con la foto
      const formData = new FormData();
      formData.append("field_name", fieldName);
      formData.append("photo", file);

      // Subir la foto al servidor usando el nuevo endpoint que actualiza la data column
      const response = await fetch(`/form_fills/${formId}/upload_photo`, {
        method: "POST",
        headers: {
          "X-CSRF-Token": document.querySelector('[name="csrf-token"]').content,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        // LIMPIAR EL INPUT INMEDIATAMENTE
        this.clearFileInput();

        // Actualizar la vista previa para mostrar que está guardada
        this.updatePreviewToSavedState(file.name);

        // Actualizar la data column directamente (new approach)
        await this.updateDataColumnQuietly(result.attachment_id, fieldName);

        // Mostrar mensaje de éxito
        this.showSuccessMessage("Photo saved successfully");
      } else {
        throw new Error(result.error || "Error uploading photo");
      }
    } catch (error) {
      console.error("Error uploading photo:", error);
      alert(`Error uploading photo: ${error.message}`);

      // En caso de error, limpiar la vista previa
      this.clearPreviewOnly();
    } finally {
      // Restaurar estado del botón
      this.hideUploadingState();
    }
  }

  // Método para mostrar estado de subida
  showUploadingState() {
    const infoElement = this.previewTarget?.querySelector(".file-info");
    if (infoElement) {
      infoElement.innerHTML = `
        <div class="flex justify-between items-center">
          <span class="flex items-center">
            <svg class="animate-spin w-3 h-3 mr-1 text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Uploading...
          </span>
          <span class="text-blue-400">Processing...</span>
        </div>
      `;
    }
  }

  // Método para ocultar estado de subida
  hideUploadingState() {
    // El estado se actualiza en updatePreviewToSavedState o se limpia en caso de error
  }

  // Método para actualizar la vista previa a estado guardado
  updatePreviewToSavedState(fileName) {
    const infoElement = this.previewTarget?.querySelector(".file-info");
    if (infoElement) {
      infoElement.innerHTML = `
        <div class="flex justify-between items-center">
          <span class="flex items-center">
            <svg class="w-3 h-3 mr-1 text-green-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
            </svg>
            ${fileName}
          </span>
          <span class="text-green-400">Saved</span>
        </div>
      `;
    }
  }

  // Método para actualizar la data column sin recargar la página
  async updateDataColumnQuietly(attachmentId, fieldName) {
    try {
      const formFillElement = document.querySelector(
        '[data-controller*="form-fill"]',
      );
      if (!formFillElement) {
        console.warn("Form fill element not found for data update");
        return;
      }

      const currentDataValue =
        formFillElement.dataset.formFillDataValue || "{}";
      const currentData = JSON.parse(currentDataValue);

      // ----> CAMBIO CLAVE AQUÍ <----
      // Usar la misma nomenclatura que el modelo de Rails.
      const attachmentKey = `${fieldName}_photo_attachment_id`;

      if (attachmentId) {
        currentData[attachmentKey] = attachmentId;
      } else {
        delete currentData[attachmentKey];
      }

      formFillElement.dataset.formFillDataValue = JSON.stringify(currentData);

      // Notify form fill controller about the change if available
      const formFillController = this.getFormFillController(formFillElement);
      if (formFillController) {
        // Update the controller's changed fields to include this photo change
        if (formFillController.changedFields) {
          formFillController.changedFields.set(
            attachmentKey,
            attachmentId || "",
          );
        }
      }

      console.log(
        `Data column updated for field: ${fieldName}, attachment: ${attachmentId}`,
      );
    } catch (error) {
      console.error("Error updating data column:", error);
      // Fallback to server reload
      await this.reloadFromServer(fieldName);
    }
  }

  // Fallback method to reload data from server
  async reloadFromServer(fieldName) {
    try {
      const formFillElement = document.querySelector(
        '[data-controller*="form-fill"]',
      );
      if (!formFillElement) return;

      const formId = formFillElement.action.split("/").pop().split("?")[0];
      const response = await fetch(`/form_fills/${formId}/structure`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": document.querySelector('[name="csrf-token"]').content,
        },
      });

      if (response.ok) {
        const data = await response.json();

        // Update both structure and data
        formFillElement.dataset.formFillFormStructureValue =
          data.form_structure;
        if (data.form_data) {
          formFillElement.dataset.formFillDataValue = JSON.stringify(
            data.form_data,
          );
        }

        // Trigger reload
        const reloadEvent = new CustomEvent("reload-form-values", {
          bubbles: true,
          detail: { fieldName: fieldName },
        });
        formFillElement.dispatchEvent(reloadEvent);
      }
    } catch (error) {
      console.error("Error reloading from server:", error);
    }
  }

  // Método para obtener el controlador form-fill
  getFormFillController(formFillElement) {
    try {
      // Método 1: Intentar acceder directamente al controlador
      if (formFillElement && this.application) {
        const controller =
          this.application.getControllerForElementAndIdentifier(
            formFillElement,
            "form-fill",
          );
        if (controller) {
          return controller;
        }
      }

      // Método 2: Buscar en el elemento directamente
      if (formFillElement && formFillElement.formFillController) {
        return formFillElement.formFillController;
      }

      // Método 3: Buscar usando Stimulus
      if (window.Stimulus && formFillElement) {
        const controller = window.Stimulus.getControllerForElementAndIdentifier(
          formFillElement,
          "form-fill",
        );
        if (controller) {
          return controller;
        }
      }

      return null;
    } catch (error) {
      console.error("Error getting form fill controller:", error);
      return null;
    }
  }
}
