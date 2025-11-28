import { Controller } from "@hotwired/stimulus";
import OfflineStorage from "utils/offline_storage";

export default class extends Controller {
  static targets = [
    "input",
    "preview",
    "status",
    "uploadButton",
    "removeButton",
  ];
  static values = {
    photoId: String,
    formFillId: String,
    fieldName: String,
    // Tipo de manejo: 'photo' (por defecto) o 'signature'
    kind: String,
    // Valores opcionales para validación; si no vienen, usar defaults
    acceptedTypes: Array,
    maxSize: Number,
  };

  connect() {
    this.isOnline = navigator.onLine;

    // Vincular handlers para poder desregistrarlos correctamente en disconnect
    this.handleOnlineBound = this.handleOnline.bind(this);
    this.handleOfflineBound = this.handleOffline.bind(this);
    this.handleRemoveConfirmedBound = this.handleRemoveConfirmed.bind(this);

    // Escuchar cambios de conectividad
    window.addEventListener("online", this.handleOnlineBound);
    window.addEventListener("offline", this.handleOfflineBound);
    this.element.addEventListener(
      "photo-remove-confirmed",
      this.handleRemoveConfirmedBound,
    );

    // Inicializar almacenamiento offline
    this.initializeOfflineStorage();

    // Reflejar estado inicial en UI
    this.updateOnlineStatus();
  }

  async initializeOfflineStorage() {
    try {
      this.offlineStorage = new OfflineStorage();
    } catch (e) {
      console.error("[OfflinePhoto] OfflineStorage no pudo inicializarse:", e);
      return;
    }

    // Cargar foto existente (si corresponde)
    await this.loadExistingPhoto();

    // Intentar cargar la última foto offline guardada para este campo
    await this.loadLatestOfflinePhotoForField();

    // Descargar y cachear thumbnail del servidor si hace falta
    await this.ensureLocalThumbnailFromServerIfNeeded();
  }

  disconnect() {
    window.removeEventListener("online", this.handleOnlineBound);
    window.removeEventListener("offline", this.handleOfflineBound);
    if (this.handleRemoveConfirmedBound) {
      this.element.removeEventListener(
        "photo-remove-confirmed",
        this.handleRemoveConfirmedBound,
      );
    }
  }

  // Handlers de conectividad
  async handleOnline() {
    this.isOnline = true;
    this.updateOnlineStatus();
    this.updateStatus("Online", "info");
    // Intentar sincronización automática si hay foto pendiente
    await this.tryAutoSync();
  }

  handleOffline() {
    this.isOnline = false;
    this.updateOnlineStatus();
    this.updateStatus("Offline", "error");
  }

  /**
   * Maneja la selección de archivos
   */
  async handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Asegurar OfflineStorage inicializado
    if (!this.offlineStorage) {
      await this.initializeOfflineStorage();
      if (!this.offlineStorage) {
        console.error(
          "[OfflinePhoto] OfflineStorage no disponible al seleccionar archivo",
        );
        this.updateStatus("Could not prepare offline storage", "error");
        return;
      }
    }

    // Validación
    const isValid = this.validateFile(file);
    if (!isValid) return;

    // Almacenar offline
    await this.storePhotoOffline(file);

    // Si estamos online, intentar sincronización inmediata
    if (navigator.onLine) {
      await this.syncPhoto();
    } else {
      this.updateStatus("Saved offline", "success");
    }
  }

  /**
   * Valida el archivo seleccionado
   */
  validateFile(file) {
    const accepted =
      Array.isArray(this.acceptedTypesValue) &&
      this.acceptedTypesValue.length > 0
        ? this.acceptedTypesValue
        : ["image/jpeg", "image/jpg", "image/png"];

    // Si no viene configurado, o viene 0/NaN/valor no positivo, usar 10MB por defecto
    let maxSize = this.maxSizeValue;
    if (!Number.isFinite(maxSize) || maxSize <= 0) {
      maxSize = 10 * 1024 * 1024; // 10MB
    }

    // Verificar tipo
    const isImage = file.type && file.type.startsWith("image/");
    if (!isImage || (!accepted.includes(file.type) && accepted.length > 0)) {
      this.updateStatus(
        `Tipo de archivo no válido. Use: ${accepted.join(", ")}`,
        "error",
      );
      return false;
    }

    // Verificar tamaño
    if (file.size > maxSize) {
      const maxSizeMB = (maxSize / 1024 / 1024).toFixed(1);
      this.updateStatus(`Archivo muy grande. Máximo: ${maxSizeMB}MB`, "error");
      return false;
    }

    return true;
  }

  /**
   * Almacena la foto en IndexedDB
   */
  async storePhotoOffline(file) {
    try {
      const photoId = this.generatePhotoId();
      const formFillId = this.formFillIdValue;
      const fieldName = this.fieldNameValue;

      // Try to enrich metadata with inspection_id
      let inspectionId = null;
      try {
        const ff = await this.offlineStorage.getFormFillData(formFillId);
        inspectionId = ff?.inspection_id || null;
      } catch (_) {}

      const metadata = {
        form_fill_id: formFillId,
        field_name: fieldName,
        inspection_id: inspectionId,
        synced: false,
        type: "original",
        is_thumbnail: false,
      };

      await this.offlineStorage.storePhotoFromFile(photoId, file, metadata);
      // Mantener también referencia en el form_fill para depuración/consistencia
      try {
        await this.offlineStorage.updateFormFill(
          formFillId,
          {},
          {
            [fieldName]: { id: photoId, synced: false, is_thumbnail: false },
          },
        );
      } catch (e) {
        console.warn(
          "[OfflinePhoto] No se pudo actualizar photos en form_fill:",
          e,
        );
      }

      this.photoIdValue = photoId;
      await this.updatePreview(photoId);
    } catch (error) {
      console.error(
        "[OfflinePhotoController] Error storing photo offline:",
        error,
      );
    }
  }

  /**
   * Actualiza el preview de la foto
   */
  async updatePreview(photoId) {
    // Encontrar elementos de imagen y contenedor
    const imgEl = this.getPreviewImageElement();
    // Intentar obtener un contenedor de preview específico (padre del IMG con id signature-preview-...)
    let containerEl = null;
    if (imgEl && imgEl.closest) {
      containerEl = imgEl.closest('[id^="signature-preview-"]');
    }
    // Fallback a lógica anterior si no se encontró
    if (!containerEl) {
      containerEl = this.getPreviewContainerElement();
    }
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
        imgEl.alt = "Captured photo";
        if (containerEl) {
          containerEl.classList.remove("hidden");
        }
        // Ocultar el canvas de firma cuando hay preview
        const canvasEl = this.element.querySelector(
          '[data-signature-pad-target="canvas"]',
        );
        if (canvasEl) {
          canvasEl.classList.add("hidden");
        }
        // Ocultar el botón Clear cuando hay una firma/preview visible
        const clearBtn = this.element.querySelector(
          '[data-signature-pad-target="clearButton"]',
        );
        if (clearBtn) {
          clearBtn.classList.add("hidden");
        }
        if (this.hasRemoveButtonTarget) {
          this.removeButtonTarget.style.display = "inline-block";
        }
        // Actualizar info de archivo en función del estado de sincronización
        let synced = false;
        try {
          const photoData = await this.offlineStorage.getPhotoBlob(photoId);
          synced = !!photoData?.metadata?.synced;
        } catch (_) {}
        const infoEl = (containerEl || this.element).querySelector(
          ".file-info",
        );
        if (infoEl) {
          infoEl.innerHTML = `
            <div class="flex justify-between items-center">
              <span class="flex items-center">
                <svg class="w-3 h-3 mr-1 ${synced ? "text-green-400" : "text-yellow-400"}" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
                </svg>
                ${synced ? "Synced" : "Offline (pending)"}
              </span>
              <span class="${synced ? "text-green-400" : "text-yellow-400"}">${synced ? "Saved" : "Saved offline"}</span>
            </div>
          `;
        }
      }
    } catch (error) {
      console.error("[OfflinePhoto] Error updating preview:", error);
    }
  }

  // Helpers para obtener elementos correctos de preview
  getPreviewImageElement() {
    // Buscar un IMG entre los targets de preview o por data-target
    const imgTarget = (this.previewTargets || []).find(
      (el) => el.tagName === "IMG",
    );
    return (
      imgTarget ||
      this.element.querySelector(
        'img[data-offline-photo-target="preview"], img[data-photo-capture-target="image"]',
      )
    );
  }

  getPreviewContainerElement() {
    // Buscar el contenedor principal de preview
    const containerTarget = (this.previewTargets || []).find(
      (el) => el.tagName !== "IMG",
    );
    if (containerTarget) return containerTarget;
    // Fallback al contenedor del photo-capture
    const container = this.element.querySelector(
      '[data-photo-capture-target="preview"]',
    );
    return container || this.element;
  }

  /**
   * Carga foto existente si existe
   */
  async loadExistingPhoto() {
    if (!this.photoIdValue) return;

    try {
      const hasPhoto = await this.offlineStorage.hasPhotoBlob(
        this.photoIdValue,
      );

      if (hasPhoto) {
        await this.updatePreview(this.photoIdValue);
        this.updateStatus("Photo loaded from offline storage", "info");
      }
    } catch (error) {
      console.error("[OfflinePhoto] Error loading existing photo:", error);
    }
  }

  /**
   * Busca la última foto guardada offline para este form_fill y field
   */
  async loadLatestOfflinePhotoForField() {
    try {
      const latest = await this.offlineStorage.getLatestPhotoForField(
        this.formFillIdValue,
        this.fieldNameValue,
      );
      if (latest && latest.id) {
        this.photoIdValue = latest.id;
        await this.updatePreview(latest.id);
        this.updateStatus("Offline photo loaded for this field", "info");
      }
    } catch (error) {
      console.error("[OfflinePhoto] Error loading last offline photo:", error);
    }
  }

  /**
   * Elimina la foto
   */
  async removePhoto() {
    if (!this.photoIdValue) return;

    try {
      this.updateStatus("Deleting photo...", "info");

      // Eliminar de IndexedDB
      await this.offlineStorage.removePhotoBlob(this.photoIdValue);

      // Limpiar preview y controles
      const imgEl = this.getPreviewImageElement();
      const containerEl = this.getPreviewContainerElement();
      if (imgEl) {
        imgEl.src = "";
      }
      if (containerEl) {
        containerEl.classList.add("hidden");
      }
      // Volver a mostrar el canvas de firma
      const canvasEl = this.element.querySelector(
        '[data-signature-pad-target="canvas"]',
      );
      if (canvasEl) {
        canvasEl.classList.remove("hidden");
      }
      // Mostrar el botón Clear nuevamente cuando se regresa al canvas
      const clearBtn = this.element.querySelector(
        '[data-signature-pad-target="clearButton"]',
      );
      if (clearBtn) {
        clearBtn.classList.remove("hidden");
      }
      if (this.hasRemoveButtonTarget) {
        this.removeButtonTarget.style.display = "none";
      }

      // Limpiar datos del formulario
      this.updateFormData(null);
      // También limpiar la data column local (attachment id) para este campo
      await this.updateDataColumnQuietly(null, this.fieldNameValue);

      // Persistir cambio en IndexedDB cuando estamos offline (sin encolar parches innecesarios)
      if (!navigator.onLine && this.offlineStorage) {
        const changedData = {};
        const kind =
          (this.kindValue && String(this.kindValue).trim()) || "photo";
        const attachmentKey =
          kind === "signature"
            ? `${this.fieldNameValue}_signature_attachment_id`
            : `${this.fieldNameValue}_photo_attachment_id`;
        changedData[attachmentKey] = null;
        changedData[this.fieldNameValue] = "";
        try {
          await this.offlineStorage.saveFormFillData(
            this.formFillIdValue,
            changedData,
          );
        } catch (e) {
          console.warn(
            "[OfflinePhoto] Failed to persist delete in IndexedDB:",
            e,
          );
        }
      }

      this.photoIdValue = "";

      this.updateStatus("Photo deleted", "success");
    } catch (error) {
      console.error("[OfflinePhoto] Error removing photo:", error);
      this.updateStatus("Error deleting photo", "error");
    }
  }

  /**
   * Sincroniza la foto con el servidor
   */
  async syncPhoto() {
    try {
      if (!this.photoIdValue) return;
      const photoData = await this.offlineStorage.getPhotoBlob(
        this.photoIdValue,
      );
      if (!photoData?.blob) return;

      // Mostrar estado de subida
      this.updateStatus("Uploading...", "info");

      // Subir original
      const uploadResponse = await this.uploadPhotoToServer(photoData.blob);
      const attachmentId =
        uploadResponse?.photo_attachment_id || uploadResponse?.attachment_id;
      if (!attachmentId) throw new Error("Server did not return attachment id");

      // Tras subir, reemplazar original por thumbnail para ahorrar espacio
      let inspectionId = photoData?.metadata?.inspection_id || null;
      try {
        if (!inspectionId) {
          const ff = await this.offlineStorage.getFormFillData(
            this.formFillIdValue,
          );
          inspectionId = ff?.inspection_id || null;
        }
      } catch (_) {}

      // Para firmas, preservar PNG; para fotos normales, usar JPEG con fondo blanco
      const isSignature =
        (this.kindValue && String(this.kindValue).trim()) === "signature";
      const outputType = isSignature ? "image/png" : "image/jpeg";
      const backgroundColor = isSignature ? null : "#ffffff";
      const thumbBlob = await this.offlineStorage.createThumbnailBlob(
        photoData.blob,
        { maxDimension: 1024, quality: 0.7, outputType, backgroundColor },
      );
      const newMeta = {
        ...photoData.metadata,
        synced: true,
        type: "thumbnail",
        is_thumbnail: true,
        photo_attachment_id: attachmentId,
        inspection_id: inspectionId,
      };
      await this.offlineStorage.storePhotoBlob(
        this.photoIdValue,
        thumbBlob,
        newMeta,
      );
      // Refrescar el preview para usar el nuevo blob
      await this.updatePreview(this.photoIdValue);
      // Mantener también referencia en el form_fill para depuración/consistencia
      try {
        await this.offlineStorage.updateFormFill(
          this.formFillIdValue,
          {},
          {
            [this.fieldNameValue]: {
              id: this.photoIdValue,
              synced: true,
              is_thumbnail: true,
              attachment_id: attachmentId,
            },
          },
        );
      } catch (e) {
        console.warn(
          "[OfflinePhoto] No se pudo actualizar photos en form_fill (sync):",
          e,
        );
      }

      // Actualizar preview y data column en el dataset
      await this.updatePreview(this.photoIdValue);
      await this.updateDataColumnQuietly(attachmentId, this.fieldNameValue);
      this.updateStatus("Saved", "success");
    } catch (error) {
      console.error("[OfflinePhotoController] Error syncing photo:", error);
      this.updateStatus("Error syncing photo", "error");
    }
  }

  async tryAutoSync() {
    try {
      if (!this.photoIdValue) return;
      const photoData = await this.offlineStorage.getPhotoBlob(
        this.photoIdValue,
      );
      if (
        photoData &&
        photoData.metadata &&
        photoData.metadata.synced === false
      ) {
        await this.syncPhoto();
      }
    } catch (error) {
      console.error("[OfflinePhoto] Error en auto sync:", error);
    }
  }

  /**
   * Actualiza los datos del formulario
   */
  updateFormData(photoId) {
    // Disparar evento personalizado para notificar cambios
    const event = new CustomEvent("photo-changed", {
      detail: {
        fieldName: this.fieldNameValue,
        photoId: photoId,
        formFillId: this.formFillIdValue,
      },
    });

    this.element.dispatchEvent(event);
  }

  /**
   * Actualiza silenciosamente la columna de datos con el attachment id
   */
  async updateDataColumnQuietly(attachmentId, fieldName) {
    try {
      const formFillElement = document.querySelector(
        '[data-controller*="form-fill"]',
      );
      if (!formFillElement) return;
      const currentDataValue =
        formFillElement.dataset.formFillDataValue || "{}";
      let currentData = {};
      try {
        currentData = JSON.parse(currentDataValue);
      } catch (_) {
        currentData = {};
      }
      const kind = (this.kindValue && String(this.kindValue).trim()) || "photo";
      const key =
        kind === "signature"
          ? `${fieldName}_signature_attachment_id`
          : `${fieldName}_photo_attachment_id`;
      // Si tenemos attachmentId válido, guardarlo; si no, eliminar la clave
      if (attachmentId) {
        currentData[key] = attachmentId;
      } else {
        delete currentData[key];
      }
      formFillElement.dataset.formFillDataValue = JSON.stringify(currentData);

      // También marcar el cambio en el controlador form-fill (para guardado incremental)
      try {
        let controller = null;
        if (this.application) {
          controller = this.application.getControllerForElementAndIdentifier(
            formFillElement,
            "form-fill",
          );
        }
        if (!controller && formFillElement.formFillController) {
          controller = formFillElement.formFillController;
        }
        if (
          !controller &&
          window.Stimulus &&
          window.Stimulus.getControllerForElementAndIdentifier
        ) {
          controller = window.Stimulus.getControllerForElementAndIdentifier(
            formFillElement,
            "form-fill",
          );
        }
        if (controller && controller.changedFields) {
          controller.changedFields.set(key, attachmentId || "");
        }
      } catch (e) {
        console.warn(
          "[OfflinePhoto] Could not set changedFields for form-fill controller:",
          e,
        );
      }
    } catch (error) {
      console.warn(
        "[OfflinePhoto] Error updating form fill data locally:",
        error,
      );
    }
  }

  /**
   * Actualiza el estado de conectividad
   */
  updateOnlineStatus() {
    const isOnline = navigator.onLine;

    if (this.hasUploadButtonTarget) {
      this.uploadButtonTarget.disabled = !isOnline;
      this.uploadButtonTarget.title = isOnline ? "Upload photo" : "Offline";
    }
  }

  /**
   * Actualiza el mensaje de estado
   */
  updateStatus(message, type = "info") {
    if (!this.hasStatusTarget) return;

    this.statusTarget.textContent = message || "";
    this.statusTarget.className = `photo-status photo-status--${type}`;

    // Auto-ocultar después de 3 segundos para mensajes de éxito/info
    if (type === "success" || type === "info") {
      setTimeout(() => {
        if (this.hasStatusTarget) {
          this.statusTarget.textContent = "";
          this.statusTarget.className = "photo-status";
        }
      }, 3000);
    }
  }

  /**
   * Genera un ID único para la foto
   */
  generatePhotoId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `photo_${this.formFillIdValue}_${this.fieldNameValue}_${timestamp}_${random}`;
  }
  /**
   * Si no hay foto local pero existe attachment de servidor y estamos online, descargar thumbnail y guardarlo
   */
  async ensureLocalThumbnailFromServerIfNeeded() {
    try {
      const latest = await this.offlineStorage.getLatestPhotoForField(
        this.formFillIdValue,
        this.fieldNameValue,
      );
      if (latest?.blob) return;

      if (!navigator.onLine) return;
      const form = this.element.closest("form");
      const dataJson =
        form?.dataset?.formFillDataValue ||
        this.element?.dataset?.formFillDataValue;
      if (!dataJson) return;
      const data = JSON.parse(dataJson);
      const kind = (this.kindValue && String(this.kindValue).trim()) || "photo";
      const attachmentKey =
        kind === "signature"
          ? `${this.fieldNameValue}_signature_attachment_id`
          : `${this.fieldNameValue}_photo_attachment_id`;
      const attachmentId = data?.[attachmentKey];
      if (!attachmentId) return;

      const photoUrl = await this.fetchServerPhotoUrl(
        this.formFillIdValue,
        this.fieldNameValue,
        attachmentId,
      );
      if (!photoUrl) return;

      const resp = await fetch(photoUrl, { credentials: "include" });
      if (!resp.ok) return;
      const serverBlob = await resp.blob();
      // Elegir tipo de salida según el tipo de dato o si es firma
      const isSignature =
        (this.kindValue && String(this.kindValue).trim()) === "signature";
      const outputType =
        isSignature || String(serverBlob?.type || "").includes("png")
          ? "image/png"
          : "image/jpeg";
      const backgroundColor = outputType === "image/jpeg" ? "#ffffff" : null;
      const thumbBlob = await this.offlineStorage.createThumbnailBlob(
        serverBlob,
        { maxDimension: 1024, quality: 0.7, outputType, backgroundColor },
      );

      const photoId = this.generatePhotoId();
      let inspectionId = null;
      try {
        const ff = await this.offlineStorage.getFormFillData(
          this.formFillIdValue,
        );
        inspectionId = ff?.inspection_id || null;
      } catch (_) {}

      const metadata = {
        form_fill_id: this.formFillIdValue,
        field_name: this.fieldNameValue,
        inspection_id: inspectionId,
        synced: true,
        type: "thumbnail",
        is_thumbnail: true,
        photo_attachment_id: attachmentId,
      };
      await this.offlineStorage.storePhotoBlob(photoId, thumbBlob, metadata);
      // Mantener también referencia en el form_fill para depuración/consistencia
      try {
        await this.offlineStorage.updateFormFill(
          this.formFillIdValue,
          {},
          {
            [this.fieldNameValue]: {
              id: photoId,
              synced: true,
              is_thumbnail: true,
              attachment_id: attachmentId,
            },
          },
        );
      } catch (e) {
        console.warn(
          "[OfflinePhoto] No se pudo actualizar photos en form_fill (server thumbnail):",
          e,
        );
      }

      this.photoIdValue = photoId;
      await this.updatePreview(photoId);
      this.updateStatus("Saved", "success");
    } catch (error) {
      console.warn(
        "[OfflinePhotoController] ensureLocalThumbnailFromServerIfNeeded error:",
        error,
      );
    }
  }

  async fetchServerPhotoUrl(formFillId, fieldName, attachmentId) {
    try {
      const form = this.element.closest("form");
      const formId = form?.dataset?.formFillIdValue || formFillId;
      const kind = (this.kindValue && String(this.kindValue).trim()) || "photo";
      const url =
        kind === "signature"
          ? `/form_fills/${formId}/signature_url`
          : `/form_fills/${formId}/photo_url`;
      const csrf = document.querySelector('[name="csrf-token"]')?.content || "";
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
          Accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          field_name: fieldName,
          attachment_id: attachmentId,
        }),
      });
      if (!resp.ok) return null;
      const json = await resp.json();
      if (kind === "signature") {
        return json?.signature_url || null;
      }
      return json?.photo_url || null;
    } catch (_) {
      return null;
    }
  }

  // Sube la foto (Blob/File) al servidor y retorna el JSON de respuesta
  async uploadPhotoToServer(blob) {
    const fieldName = this.fieldNameValue;
    if (!fieldName) {
      console.error(
        "[OfflinePhotoController] Could not determine field name for photo upload",
      );
      return null;
    }

    try {
      // Mostrar estado de carga en UI
      this.updateStatus("Uploading...", "info");

      // Obtener el ID del formulario (form fill)
      const formElement = document.querySelector(
        '[data-controller*="form-fill"]',
      );
      const formId =
        this.formFillIdValue ||
        (formElement
          ? formElement.action.split("/").pop().split("?")[0]
          : null);
      if (!formId) throw new Error("Form element or formFillId not found");

      // Asegurar nombre de archivo para Blob
      const fileToSend =
        blob instanceof File
          ? blob
          : new File([blob], `${fieldName}-${Date.now()}.jpg`, {
              type: blob.type || "image/jpeg",
            });

      // Crear FormData con la foto
      const formData = new FormData();
      formData.append("field_name", fieldName);
      formData.append("photo", fileToSend);

      // Subir la foto al servidor usando el endpoint que actualiza la data column
      const csrf = document.querySelector('[name="csrf-token"]')?.content || "";
      const response = await fetch(`/form_fills/${formId}/upload_photo`, {
        method: "POST",
        headers: {
          "X-CSRF-Token": csrf,
          Accept: "application/json",
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        return result;
      } else {
        throw new Error(result.error || "Error uploading photo");
      }
    } catch (error) {
      console.error("[OfflinePhotoController] Error uploading photo:", error);
      this.updateStatus("Error uploading photo", "error");
      return null;
    }
  }

  async handleRemoveConfirmed(event) {
    try {
      event?.preventDefault();
      event?.stopPropagation();
    } catch (_) {}

    // Borrar localmente solo luego de confirmación del usuario
    await this.removePhoto();

    const kind = (this.kindValue && String(this.kindValue).trim()) || "photo";
    // Si estamos offline, encolar eliminación para sincronización
    if (!navigator.onLine && this.offlineStorage) {
      const numericFormFillId = parseInt(this.formFillIdValue, 10);
      let inspectionId = null;
      try {
        const ff = await this.offlineStorage.getFormFillData(numericFormFillId);
        inspectionId = ff?.inspection_id || null;
      } catch (e) {
        console.warn(
          "[OfflinePhoto] Could not fetch form fill for inspection_id:",
          e,
        );
      }
      const payload = {
        form_fill_id: numericFormFillId,
        field_name: this.fieldNameValue,
      };
      try {
        const queueType =
          kind === "signature" ? "signature_delete" : "photo_delete";
        await this.offlineStorage.addToSyncQueue(
          queueType,
          inspectionId,
          numericFormFillId,
          payload,
        );
        // Opcional: notificar a UI de que hay cambios pendientes
        try {
          const evt = new CustomEvent("sync:pending-changes", {
            detail: { formFillId: numericFormFillId, pending: true },
            bubbles: true,
          });
          document.dispatchEvent(evt);
        } catch (e) {}
      } catch (e) {
        console.warn("[OfflinePhoto] Failed to enqueue photo_delete:", e);
      }
    }

    // Si estamos online, ejecutar borrado inmediato en servidor
    if (navigator.onLine) {
      try {
        const form = this.element.closest("form");
        const formId = form?.dataset?.formFillIdValue || this.formFillIdValue;
        const csrf =
          document.querySelector('[name="csrf-token"]')?.content || "";
        const endpoint =
          kind === "signature" ? "remove_signature" : "remove_photo";
        const resp = await fetch(`/form_fills/${formId}/${endpoint}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
            Accept: "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ field_name: this.fieldNameValue }),
        });
        if (resp.ok) {
          const json = await resp.json();
          if (json?.success) {
            await this.updateDataColumnQuietly(null, this.fieldNameValue);
            this.updateStatus("Deleted", "success");
          } else {
            this.updateStatus("Server delete failed", "error");
          }
        } else {
          this.updateStatus("Server delete failed", "error");
        }
      } catch (e) {
        console.warn("[OfflinePhoto] Error deleting on server:", e);
      }
    }
  }
}
