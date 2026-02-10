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

  /**
   * Inicializa el controlador, configura los listeners de eventos e inicia el almacenamiento offline.
   */
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

  /**
   * Inicializa OfflineStorage y carga fotos o firmas existentes.
   */
  async initializeOfflineStorage() {
    try {
      this.offlineStorage = new OfflineStorage();
    } catch (e) {
      console.error("[OfflinePhoto] OfflineStorage no pudo inicializarse:", e);
      return;
    }

    // Cargar foto existente (si corresponde) - Principalmente para firmas
    await this.loadExistingPhoto();

    // Intentar cargar la última foto offline guardada para este campo (Legacy/Signature)
    await this.loadLatestOfflinePhotoForField();

    // Cargar todas las fotos offline (Multi-photo support)
    if (this.kindValue !== "signature") {
      await this.loadAllOfflinePhotosForField();
    }

    // Descargar y cachear thumbnail del servidor si hace falta
    await this.ensureLocalThumbnailFromServerIfNeeded();
  }

  /**
   * Carga todas las fotos offline para el campo actual y las agrega a la galería.
   */
  async loadAllOfflinePhotosForField() {
    try {
      const photos = await this.offlineStorage.getPhotosForField(
        this.formFillIdValue,
        this.fieldNameValue,
      );

      const captureController =
        this.application.getControllerForElementAndIdentifier(
          this.element,
          "photo-capture",
        );

      if (!captureController) return;

      for (const photo of photos) {
        // Si no está sincronizada, agregar a la galería como offline
        if (!photo.metadata?.synced) {
          captureController.addToGallery(photo.blob, photo.id, false);
        }
      }
    } catch (error) {
      console.error("[OfflinePhoto] Error loading offline photos:", error);
    }
  }

  /**
   * Limpia los listeners de eventos cuando el controlador se desconecta.
   */
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

  /**
   * Maneja el evento 'online'. Actualiza el estado e intenta sincronizar fotos pendientes.
   */
  async handleOnline() {
    this.isOnline = true;
    this.updateOnlineStatus();
    this.updateStatus("Online", "info");
    // Intentar sincronización automática si hay foto pendiente
    await this.tryAutoSync();
  }

  /**
   * Maneja el evento 'offline'. Actualiza el estado para indicar modo sin conexión.
   */
  handleOffline() {
    this.isOnline = false;
    this.updateOnlineStatus();
    this.updateStatus("Offline", "error");
  }

  /**
   * Maneja la selección de archivos desde el input.
   * Valida archivos, los almacena offline (o subida directa si es necesario) y actualiza la UI.
   * @param {Event} event - El evento de cambio del input.
   */
  async handleFileSelect(event) {
    try {
      const files = Array.from(event.target.files);
      if (!files || files.length === 0) return;

      // Asegurar OfflineStorage inicializado
      if (!this.offlineStorage) {
        await this.initializeOfflineStorage();
      }

      const storageAvailable = !!this.offlineStorage;

      // Si el almacenamiento falla y estamos offline, no podemos hacer nada
      if (!storageAvailable && !navigator.onLine) {
        alert(
          "Error: The offline storage is not available and there is no internet connection. No photos can be saved.",
        );
        this.updateStatus("Storage Error & Offline", "error");
        return;
      }

      // Si el almacenamiento falló pero estamos online, notificar bypass
      if (!storageAvailable && navigator.onLine) {
        console.warn(
          "[OfflinePhoto] Storage failed, bypassing to direct upload.",
        );
        this.updateStatus("Storage warning: Uploading directly...", "info");
      }

      let successCount = 0;
      let errorCount = 0;

      // Iterar sobre todos los archivos seleccionados
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Validación individual
        const isValid = this.validateFile(file);
        if (!isValid) {
          errorCount++;
          continue;
        }

        if (storageAvailable) {
          // CAMINO NORMAL: Almacenar offline primero
          try {
            await this.storePhotoOffline(file);
            successCount++;
          } catch (e) {
            console.error(`[OfflinePhoto] Error storing file ${file.name}:`, e);
            errorCount++;
          }
        } else {
          // FALLBACK: Subida directa (Storage roto pero Online)
          try {
            const result = await this.uploadPhotoToServer(file);
            if (result && result.success) {
              successCount++;

              // Actualizar UI manualmente ya que syncPhoto no correrá
              await this.updateDataColumnQuietly(
                result.attachment_id || result.photo_attachment_id,
                this.fieldNameValue,
              );

              if (this.kindValue !== "signature") {
                const captureController =
                  this.application.getControllerForElementAndIdentifier(
                    this.element,
                    "photo-capture",
                  );
                if (captureController) {
                  captureController.addToGallery(
                    file,
                    result.attachment_id || result.photo_attachment_id,
                    true,
                  );
                }
              } else {
                // Si es firma/single photo, actualizar preview
                this.photoIdValue =
                  result.attachment_id || result.photo_attachment_id; // Use server ID temporarily
                const imgEl = this.getPreviewImageElement();
                if (imgEl) {
                  imgEl.src = URL.createObjectURL(file);
                  const container = imgEl.closest(".hidden");
                  if (container) container.classList.remove("hidden");
                }
              }
            } else {
              errorCount++;
            }
          } catch (e) {
            console.error(
              `[OfflinePhoto] Direct upload failed for ${file.name}:`,
              e,
            );
            errorCount++;
          }
        }
      }

      // Reportar resultado
      if (successCount > 0) {
        if (storageAvailable && navigator.onLine) {
          // Si estamos online y storage funciona, intentar sincronización normal
          this.updateStatus(`Uploading ${successCount} photos...`, "info");
          await this.syncPhoto();
        } else if (!storageAvailable) {
          // Si fue subida directa
          this.updateStatus(`Uploaded ${successCount} photos`, "success");
        } else {
          // Offline normal
          this.updateStatus(`Saved ${successCount} photos offline`, "success");
        }
      }

      if (errorCount > 0) {
        // Si hubo errores, mantener el mensaje de error visible
        if (successCount === 0) {
          this.updateStatus(`Failed to save ${errorCount} photos`, "error");
        } else {
          this.updateStatus(
            `Saved ${successCount}, Failed ${errorCount}`,
            "warning",
          );
        }
      }
    } catch (criticalError) {
      console.error(
        "[OfflinePhoto] CRITICAL ERROR in handleFileSelect:",
        criticalError,
      );
      alert(
        "Critical Error: An unexpected error occurred while selecting the photo. Please try again.",
      );
      this.updateStatus("Critical Error", "error");
    }
  }

  /**
   * Valida el archivo seleccionado contra tipos aceptados y tamaño máximo.
   * @param {File} file - El archivo a validar.
   * @returns {boolean} True si es válido, false en caso contrario.
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
        `Invalid file type. Use: ${accepted.join(", ")}`,
        "error",
      );
      return false;
    }

    // Verificar tamaño
    if (file.size > maxSize) {
      const maxSizeMB = (maxSize / 1024 / 1024).toFixed(1);
      this.updateStatus(`File is too large. Maximum: ${maxSizeMB}MB`, "error");
      return false;
    }

    return true;
  }

  /**
   * Almacena la foto en IndexedDB.
   * @param {File} file - El archivo a almacenar.
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
        console.warn("[OfflinePhoto] Failed to update photos in form_fill:", e);
      }

      if (this.kindValue === "signature") {
        this.photoIdValue = photoId;
        await this.updatePreview(photoId);
      } else {
        // Multi-photo: Add to gallery via photo-capture controller
        const captureController =
          this.application.getControllerForElementAndIdentifier(
            this.element,
            "photo-capture",
          );
        if (captureController) {
          captureController.addToGallery(file, photoId, false);
        }
      }
    } catch (error) {
      console.error(
        "[OfflinePhotoController] Error storing photo offline:",
        error,
      );
    }
  }

  /**
   * Updates the photo preview element with the image from IndexedDB.
   * @param {string} photoId - The ID of the photo to display.
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

  /**
   * Helper para encontrar el elemento de imagen de previsualización.
   * @returns {HTMLImageElement|null} El elemento de imagen.
   */
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

  /**
   * Helper para encontrar el elemento contenedor de previsualización.
   * @returns {HTMLElement} El elemento contenedor.
   */
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
   * Carga una foto existente del almacenamiento offline si photoIdValue está presente.
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
   * Loads the latest offline photo stored for this field (used for signatures/legacy).
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
   * Removes a photo from offline storage and optionally from the server if online.
   * @param {string} photoId - The ID of the photo to remove.
   */
  async removePhoto(photoId) {
    const targetId = photoId || this.photoIdValue;
    if (!targetId) return;

    try {
      this.updateStatus("Deleting photo...", "info");

      // Si estamos online, intentar eliminar del servidor inmediatamente
      if (navigator.onLine) {
        try {
          const photoData = await this.offlineStorage.getPhotoBlob(targetId);
          const attachmentId =
            photoData?.metadata?.photo_attachment_id ||
            photoData?.metadata?.attachment_id;
          await this.deletePhotoFromServer(
            targetId,
            this.fieldNameValue,
            attachmentId,
          );
        } catch (e) {
          console.warn("[OfflinePhoto] Error trying to delete from server:", e);
        }
      }

      // Eliminar de IndexedDB
      await this.offlineStorage.removePhotoBlob(targetId);

      // Limpiar preview y controles (Signature/Legacy)
      if (this.kindValue === "signature" || targetId === this.photoIdValue) {
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

        this.updateFormData(null);
        this.photoIdValue = "";
      }

      // También limpiar la data column local (attachment id) para este campo
      await this.updateDataColumnQuietly(targetId, this.fieldNameValue, true);

      // Persistir cambio en IndexedDB cuando estamos offline
      if (!navigator.onLine && this.offlineStorage) {
        const changedData = {};
        const kind =
          (this.kindValue && String(this.kindValue).trim()) || "photo";
        // For array support, we rely on updateDataColumnQuietly updating the DOM dataset
        // But here we want to update the FormFill object in IndexedDB.
        // We might need to read the current dataset to know the new value.

        // Queue delete job
        const numericFormFillId = parseInt(this.formFillIdValue, 10);
        let inspectionId = null;
        try {
          const ff =
            await this.offlineStorage.getFormFillData(numericFormFillId);
          inspectionId = ff?.inspection_id || null;
        } catch (_) {}

        const payload = {
          form_fill_id: numericFormFillId,
          field_name: this.fieldNameValue,
          photo_id: targetId,
        };

        const queueType =
          this.kindValue === "signature" ? "signature_delete" : "photo_delete";

        try {
          await this.offlineStorage.addToSyncQueue(
            queueType,
            inspectionId,
            numericFormFillId,
            payload,
          );
        } catch (e) {
          console.warn("[OfflinePhoto] Failed to enqueue delete:", e);
        }
      }

      this.updateStatus("Photo deleted", "success");
    } catch (error) {
      console.error("[OfflinePhoto] Error removing photo:", error);
      this.updateStatus("Error deleting photo", "error");
    }
  }

  /**
   * Envía una solicitud de eliminación al servidor para una foto.
   * @param {string} photoId - El ID local de la foto.
   * @param {string} fieldName - El nombre del campo.
   * @param {string} attachmentId - El ID del adjunto en el servidor.
   */
  async deletePhotoFromServer(photoId, fieldName, attachmentId) {
    try {
      const form = this.element.closest("form");
      const formId = form?.dataset?.formFillIdValue || this.formFillIdValue;
      const csrf = document.querySelector('[name="csrf-token"]')?.content || "";

      let url, body;
      const kind = (this.kindValue && String(this.kindValue).trim()) || "photo";

      if (kind === "signature") {
        url = `/form_fills/${formId}/remove_signature`;
        body = JSON.stringify({ field_name: fieldName });
      } else {
        // Si es foto, necesitamos el attachment ID
        if (!attachmentId) return;
        url = `/form_fills/${formId}/remove_photo`;
        body = JSON.stringify({
          field_name: fieldName,
          photo_id: attachmentId,
        });
      }

      const resp = await fetch(url, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
          Accept: "application/json",
        },
        body: body,
      });

      if (!resp.ok) {
        console.error("Server delete failed with status:", resp.status);
      }
    } catch (e) {
      console.error("Error deleting from server:", e);
    }
  }

  /**
   * Sincroniza fotos con el servidor.
   * Sincroniza la firma específica o todas las fotos no sincronizadas para el campo.
   */
  async syncPhoto() {
    if (this.kindValue === "signature") {
      await this.syncSpecificPhoto(this.photoIdValue);
    } else {
      // Sync all unsynced photos for this field
      try {
        const photos = await this.offlineStorage.getPhotosForField(
          this.formFillIdValue,
          this.fieldNameValue,
        );
        for (const photo of photos) {
          if (!photo.metadata?.synced) {
            await this.syncSpecificPhoto(photo.id);
          }
        }
      } catch (e) {
        console.error("Error in multi-photo sync:", e);
      }
    }
  }

  /**
   * Sincroniza una foto específica por ID.
   * Sube al servidor, actualiza metadatos locales (thumbnail) y actualiza la UI.
   * @param {string} photoId - El ID de la foto a sincronizar.
   */
  async syncSpecificPhoto(photoId) {
    try {
      if (!photoId) return;
      const photoData = await this.offlineStorage.getPhotoBlob(photoId);
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
      await this.offlineStorage.storePhotoBlob(photoId, thumbBlob, newMeta);

      // Refrescar el preview para usar el nuevo blob (Solo si es el actual o signature)
      if (isSignature || photoId === this.photoIdValue) {
        await this.updatePreview(photoId);
      }

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
          "[OfflinePhoto] No se pudo actualizar photos en form_fill (sync):",
          e,
        );
      }

      // Actualizar data column en el dataset
      await this.updateDataColumnQuietly(attachmentId, this.fieldNameValue);

      // If multi-photo, update gallery item status
      if (!isSignature) {
        const captureController =
          this.application.getControllerForElementAndIdentifier(
            this.element,
            "photo-capture",
          );
        if (captureController) {
          // We need a way to update status in gallery.
          // Re-add it? Or update element?
          // The photo-capture controller adds "Saved" label if synced.
          // We can just re-render it or find it.
          const galleryItem = document.getElementById(`photo-${photoId}`);
          if (galleryItem) {
            // Update ID to attachmentID?
            // Wait, photoId is local GUID. attachmentId is server ID.
            // When synced, we usually swap IDs or keep local mapped to server.
            // The gallery uses `photo-${attachmentId}` if loaded from server.
            // But if loaded from offline, it uses `photo-${photoId}`.
            // When synced, we have `attachmentId`.
            // We should update the gallery item ID and status.

            galleryItem.id = `photo-${attachmentId}`;
            const btn = galleryItem.querySelector("button");
            if (btn) btn.dataset.photoId = attachmentId;

            const statusBadge = galleryItem.querySelector(".bg-black\\/50");
            if (statusBadge) statusBadge.textContent = "Saved";
          }
        }
      }

      this.updateStatus("Saved", "success");
    } catch (error) {
      console.error("[OfflinePhotoController] Error syncing photo:", error);
      this.updateStatus("Error syncing photo", "error");
    }
  }

  /**
   * Intenta sincronizar automáticamente las fotos pendientes.
   */
  async tryAutoSync() {
    try {
      await this.syncPhoto();
    } catch (error) {
      console.error("[OfflinePhoto] Error en auto sync:", error);
    }
  }

  /**
   * Dispara un evento personalizado para notificar a otros controladores sobre cambios en las fotos.
   * @param {string} photoId - El ID de la foto.
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
   * Actualiza silenciosamente la columna de datos del controlador form-fill con el nuevo ID del adjunto.
   * Esto asegura que los guardados/envíos posteriores incluyan la referencia a la foto.
   * @param {string} attachmentId - El ID del adjunto en el servidor.
   * @param {string} fieldName - El nombre del campo.
   * @param {boolean} isRemoval - Indica si es una operación de eliminación.
   */
  async updateDataColumnQuietly(attachmentId, fieldName, isRemoval = false) {
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

      if (kind === "signature") {
        // Si tenemos attachmentId válido, guardarlo; si no, eliminar la clave
        if (attachmentId && !isRemoval) {
          currentData[key] = attachmentId;
        } else {
          delete currentData[key];
        }
      } else {
        // Lógica para array de fotos
        let ids = currentData[key];
        if (!Array.isArray(ids)) {
          ids = ids ? [ids] : [];
        }

        if (isRemoval) {
          if (attachmentId) {
            ids = ids.filter((id) => String(id) !== String(attachmentId));
          }
        } else if (attachmentId) {
          if (!ids.includes(attachmentId)) {
            ids.push(attachmentId);
          }
        }

        if (ids.length > 0) {
          currentData[key] = ids;
        } else {
          delete currentData[key];
        }
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
          controller.changedFields.set(key, currentData[key] || "");
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
   * Actualiza el estado de la UI de los botones basado en el estado online/offline.
   */
  updateOnlineStatus() {
    const isOnline = navigator.onLine;

    if (this.hasUploadButtonTarget) {
      this.uploadButtonTarget.disabled = !isOnline;
      this.uploadButtonTarget.title = isOnline ? "Upload photo" : "Offline";
    }
  }

  /**
   * Actualiza el mensaje de estado en la UI.
   * @param {string} message - El mensaje a mostrar.
   * @param {string} type - El tipo de mensaje ('info', 'success', 'error', 'warning').
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
   * Genera un ID único para una nueva foto.
   * @returns {string} El ID único.
   */
  generatePhotoId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `photo_${this.formFillIdValue}_${this.fieldNameValue}_${timestamp}_${random}`;
  }

  /**
   * Checks if there's a server thumbnail available that is not yet local, and downloads it.
   * This is important for consistency when switching devices or clearing cache.
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

  /**
   * Obtiene la URL de una foto desde el servidor.
   * @param {string} formFillId - El ID del llenado de formulario.
   * @param {string} fieldName - El nombre del campo.
   * @param {string} attachmentId - El ID del adjunto.
   * @returns {string|null} La URL de la foto o null.
   */
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

  /**
   * Uploads a photo blob to the server.
   * @param {Blob} blob - The photo blob to upload.
   * @returns {Object|null} The response JSON or null on failure.
   */
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

  /**
   * Maneja el evento de confirmación de eliminación de foto.
   * @param {CustomEvent} event - El evento de confirmación.
   */
  handleRemoveConfirmed(event) {
    if (!confirm("Are you sure you want to delete this photo?")) {
      event.stopImmediatePropagation();
      event.preventDefault();
      return;
    }
    const photoId = event.detail?.photoId || this.photoIdValue;
    if (photoId) {
      this.removePhoto(photoId);
    }
  }
}
