import { Controller } from "@hotwired/stimulus";

// OfflineStorage is now available globally via importmap
export default class extends Controller {
  static targets = [
    "downloadButton",
    "progressContainer",
    "progressBar",
    "progressText",
    "statusIcon",
  ];
  static values = {
    inspectionId: Number,
    inspectionTitle: String,
  };

  /**
   * Inicializa el controlador e inicia la configuración de almacenamiento offline.
   */
  connect() {
    this.initializeOfflineStorage();
  }

  /**
   * Verifica la disponibilidad de OfflineStorage y lo inicializa.
   * Reintenta si no está disponible inmediatamente.
   */
  async initializeOfflineStorage() {
    if (typeof OfflineStorage === "undefined") {
      // If not available yet, wait and retry
      setTimeout(() => this.initializeOfflineStorage(), 100);
      return;
    }

    this.offlineStorage = new OfflineStorage();
    await this.updateDownloadStatus();
  }

  /**
   * Actualiza la UI basándose en si la inspección está descargada o no.
   */
  async updateDownloadStatus() {
    try {
      const isDownloaded = await this.offlineStorage.hasInspection(
        this.inspectionIdValue,
      );

      if (isDownloaded) {
        this.showDownloadedState();
      } else {
        this.showNotDownloadedState();
      }
    } catch (error) {
      console.error("Error checking download status:", error);
      this.showErrorState();
    }
  }

  /**
   * Descarga los datos de la inspección, incluyendo fotos y formularios, para uso offline.
   */
  async downloadInspection() {
    if (!navigator.onLine) {
      this.showMessage("No hay conexión a internet", "error");
      return;
    }

    try {
      this.showDownloadingState();

      // Realizar la descarga desde la API
      const response = await fetch(
        `/api/v1/inspections/${this.inspectionIdValue}/offline_data`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "X-CSRF-Token": document.querySelector('[name="csrf-token"]')
              .content,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        // Almacenar los datos en IndexedDB
        await this.offlineStorage.storeInspection(result.data);

        // Solicitar al Service Worker que precachee las páginas HTML críticas
        await this.precacheInspectionPages(result.data);

        // Descargar y guardar las fotos del servidor en IndexedDB
        await this.downloadAndStorePhotos(result.data);

        this.showDownloadedState();
        this.showMessage("Inspection downloaded successfully", "success");

        // Disparar evento personalizado para notificar a otros componentes
        this.dispatch("downloaded", {
          detail: {
            inspectionId: this.inspectionIdValue,
            inspectionTitle: this.inspectionTitleValue,
          },
        });
      } else {
        throw new Error(result.message || "Error desconocido");
      }
    } catch (error) {
      console.error("Error downloading inspection:", error);
      this.showErrorState();
      this.showMessage(`Error downloading: ${error.message}`, "error");
    }
  }

  /**
   * Descarga las fotos asociadas con la inspección y las almacena en IndexedDB.
   * @param {Object} inspectionData - Datos de la inspección conteniendo form fills y fotos.
   */
  async downloadAndStorePhotos(inspectionData) {
    try {
      const formFills = Array.isArray(inspectionData?.form_fills)
        ? inspectionData.form_fills
        : [];
      if (formFills.length === 0) return;

      // Preparar progreso
      if (this.hasProgressContainerTarget)
        this.progressContainerTarget.classList.remove("hidden");
      if (this.hasProgressTextTarget)
        this.progressTextTarget.textContent = "Downloading photos...";

      // Contar total de fotos a descargar
      let totalPhotos = 0;
      for (const ff of formFills) {
        const photosArr = Array.isArray(ff?.photos) ? ff.photos : [];
        totalPhotos += photosArr.length;
      }
      if (totalPhotos === 0) return;

      let downloaded = 0;
      for (const ff of formFills) {
        const photosArr = Array.isArray(ff?.photos) ? ff.photos : [];
        if (photosArr.length === 0) continue;

        // Construir mapa attachment_id -> field_name desde data
        const data = ff?.data || {};
        const attachmentToField = {};
        Object.keys(data || {}).forEach((key) => {
          if (key.endsWith("_photo_attachment_id")) {
            const fieldName = key.replace("_photo_attachment_id", "");
            const attId = data[key];
            if (attId) attachmentToField[String(attId)] = fieldName;
          }
        });

        for (const photo of photosArr) {
          try {
            const url = photo?.url;
            if (!url) continue;
            const resp = await fetch(url, { credentials: "include" });
            if (!resp.ok) throw new Error(`Failed to fetch photo ${photo.id}`);
            const blob = await resp.blob();

            // Crear thumbnail para ahorrar espacio
            // Mantener PNG si la imagen original es PNG (p.ej., firmas); usar JPEG con fondo blanco para fotos
            const isPNG = String(blob?.type || "").includes("png");
            const outputType = isPNG ? "image/png" : "image/jpeg";
            const backgroundColor =
              outputType === "image/jpeg" ? "#ffffff" : null;
            const thumbBlob = await this.offlineStorage.createThumbnailBlob(
              blob,
              { maxDimension: 1024, quality: 0.7, outputType, backgroundColor },
            );

            // Metadatos para IndexedDB
            const metadata = {
              form_fill_id: ff.id,
              field_name: attachmentToField[String(photo.id)] || null,
              inspection_id: ff.inspection_id,
              synced: true,
              type: "thumbnail",
              is_thumbnail: true,
              photo_attachment_id: photo.id,
            };

            // Generar un id estable para la foto basada en attachment y form_fill
            const photoId = `photo_${ff.id}_${metadata.field_name || "attachment"}_${photo.id}`;

            await this.offlineStorage.storePhotoBlob(
              photoId,
              thumbBlob,
              metadata,
            );

            // Actualizar referencia en form_fill si tenemos field_name
            if (metadata.field_name) {
              try {
                await this.offlineStorage.updateFormFill(
                  ff.id,
                  {},
                  {
                    [metadata.field_name]: {
                      id: photoId,
                      synced: true,
                      is_thumbnail: true,
                      attachment_id: photo.id,
                    },
                  },
                );
              } catch (e) {
                console.warn(
                  "[InspectionDownload] Could not update form_fill photo reference:",
                  e,
                );
              }
            }

            // Actualizar progreso
            downloaded += 1;
            const pct = Math.round((downloaded / totalPhotos) * 100);
            if (this.hasProgressBarTarget)
              this.progressBarTarget.style.width = `${pct}%`;
            if (this.hasProgressTextTarget)
              this.progressTextTarget.textContent = `Downloading photos... (${downloaded}/${totalPhotos})`;
          } catch (e) {
            console.warn(
              `[InspectionDownload] Failed to store photo ${photo?.id}:`,
              e,
            );
          }
        }
      }

      // Ocultar barra de progreso al terminar
      this.hideProgressBar();
    } catch (e) {
      console.warn("[InspectionDownload] Error downloading photos:", e);
    }
  }

  /**
   * Solicita al Service Worker precachear páginas críticas para navegación offline.
   * @param {Object} inspectionData - Datos de la inspección conteniendo ID y form fills.
   */
  async precacheInspectionPages(inspectionData) {
    try {
      if (!("serviceWorker" in navigator)) {
        console.warn(
          "[InspectionDownload] Service Worker no soportado en este navegador",
        );
        return;
      }

      const inspectionId = inspectionData?.inspection?.id;
      const formFills = Array.isArray(inspectionData?.form_fills)
        ? inspectionData.form_fills
        : [];
      const urls = [];

      if (inspectionId) urls.push(`/inspections/${inspectionId}`);
      for (const ff of formFills) {
        if (ff?.id) urls.push(`/form_fills/${ff.id}`);
      }

      if (urls.length === 0) {
        return;
      }

      // Enviar mensaje al SW activo (o al controlador) para que precachee
      const registration = await navigator.serviceWorker.getRegistration();
      const target = registration?.active || navigator.serviceWorker.controller;
      if (target) {
        target.postMessage({ type: "PRECACHE_URLS", urls });
      } else {
        console.warn("[InspectionDownload] No hay SW activo para precachear");
      }
    } catch (e) {
      console.warn("[InspectionDownload] Error solicitando precache al SW:", e);
    }
  }

  /**
   * Elimina la inspección y sus datos del almacenamiento offline.
   */
  async removeInspection() {
    try {
      this.showRemovingState();

      // Intentar limpiar caché del Service Worker antes de borrar los datos
      try {
        const formFills = await this.offlineStorage.getFormFillsByInspection(
          this.inspectionIdValue,
        );
        const urlsToRemove = [`/inspections/${this.inspectionIdValue}`];

        if (formFills && Array.isArray(formFills)) {
          formFills.forEach((ff) => {
            urlsToRemove.push(`/form_fills/${ff.id}`);
          });
        }

        if (
          "serviceWorker" in navigator &&
          navigator.serviceWorker.controller
        ) {
          await new Promise((resolve) => {
            const channel = new MessageChannel();
            channel.port1.onmessage = () => {
              resolve();
            };

            navigator.serviceWorker.controller.postMessage(
              { type: "CLEANUP_URLS", urls: urlsToRemove },
              [channel.port2],
            );

            // Timeout de seguridad: si el SW no responde en 500ms, continuar de todos modos
            setTimeout(() => {
              console.warn(
                "[InspectionDownload] Cache cleanup timed out, proceeding anyway",
              );
              resolve();
            }, 500);
          });
        }
      } catch (cacheError) {
        console.warn(
          "[InspectionDownload] Failed to clean up cache:",
          cacheError,
        );
      }

      // Remover de IndexedDB
      await this.offlineStorage.removeInspection(this.inspectionIdValue);

      this.showNotDownloadedState();
      this.showMessage("Inspection removed from offline storage", "success");

      // Disparar evento personalizado
      this.dispatch("removed", {
        detail: {
          inspectionId: this.inspectionIdValue,
          inspectionTitle: this.inspectionTitleValue,
        },
      });

      // Forzar actualización de UI de Sync y StorageStats
      document.dispatchEvent(new CustomEvent("sync:pending-changes"));

      // Intentar actualizar StorageStats si el controlador está presente en la página
      const storageStatsElement = document.querySelector(
        '[data-controller="storage-stats"]',
      );
      if (storageStatsElement) {
        // Acceder a la instancia del controlador si es posible, o simular click en refresh
        const refreshBtn = storageStatsElement.querySelector(
          '[data-action="storage-stats#refresh"]',
        );
        if (refreshBtn) refreshBtn.click();
      }
    } catch (error) {
      console.error("Error removing inspection:", error);
      this.showErrorState();
      this.showMessage(`Error al remover: ${error.message}`, "error");
    }
  }

  /**
   * Maneja la acción de eliminar, limpiando datos offline antes de borrar del servidor.
   * @param {Event} event - El evento de eliminación.
   */
  async delete(event) {
    event.preventDefault();

    if (!confirm("Are you sure you want to delete this inspection?")) {
      return;
    }

    const button = event.currentTarget;
    button.style.opacity = "0.5";
    button.style.pointerEvents = "none";

    try {
      await this.removeInspection();

      const url = button.href;
      const csrfToken = document.querySelector('[name="csrf-token"]').content;

      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          "X-CSRF-Token": csrfToken,
          Accept:
            "text/vnd.turbo-stream.html, text/html, application/xhtml+xml",
        },
        redirect: "manual",
      });

      if (
        response.ok ||
        response.type === "opaqueredirect" ||
        (response.status >= 300 && response.status < 400)
      ) {
        window.location.reload();
      } else {
        console.error(
          "Server delete failed:",
          response.status,
          response.statusText,
        );
        alert("Failed to delete inspection on server.");
        button.style.opacity = "1";
        button.style.pointerEvents = "auto";
      }
    } catch (error) {
      console.error(
        "[InspectionDownload] Error during deletion process:",
        error,
      );
      alert("An error occurred while deleting.");
      button.style.opacity = "1";
      button.style.pointerEvents = "auto";
    }
  }

  /**
   * Actualiza la UI para mostrar el estado de descargando.
   */
  showDownloadingState() {
    if (this.hasDownloadButtonTarget) {
      this.downloadButtonTarget.disabled = true;
      this.downloadButtonTarget.innerHTML = `
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Downloading...
      `;
    }

    if (this.hasProgressContainerTarget) {
      this.progressContainerTarget.classList.remove("hidden");
    }
    if (this.hasProgressBarTarget) {
      this.progressBarTarget.style.width = "50%";
    }

    if (this.hasProgressTextTarget) {
      this.progressTextTarget.textContent = "Downloading data...";
    }
  }

  /**
   * Actualiza la UI para mostrar el estado de eliminando.
   */
  showRemovingState() {
    if (this.hasDownloadButtonTarget) {
      this.downloadButtonTarget.disabled = true;
      this.downloadButtonTarget.innerHTML = `
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Removing...
      `;
    }
  }

  /**
   * Actualiza la UI para mostrar el estado de descargado.
   */
  showDownloadedState() {
    if (this.hasDownloadButtonTarget) {
      this.downloadButtonTarget.disabled = false;
      this.downloadButtonTarget.className =
        "inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors";
      this.downloadButtonTarget.innerHTML = `
        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
        </svg>
        Remove Offline
      `;
      this.downloadButtonTarget.onclick = () => this.removeInspection();
    }

    if (this.hasStatusIconTarget) {
      this.statusIconTarget.innerHTML = `
        <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
      `;
    }

    this.hideProgressBar();
  }

  /**
   * Actualiza la UI para mostrar el estado de no descargado.
   */
  showNotDownloadedState() {
    if (this.hasDownloadButtonTarget) {
      this.downloadButtonTarget.disabled = false;
      this.downloadButtonTarget.className =
        "inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors";
      this.downloadButtonTarget.innerHTML = `
        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
        </svg>
        Download Offline
      `;
      this.downloadButtonTarget.onclick = () => this.downloadInspection();
    }

    if (this.hasStatusIconTarget) {
      this.statusIconTarget.innerHTML = `
        <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"></path>
        </svg>
      `;
    }

    this.hideProgressBar();
  }

  /**
   * Actualiza la UI para mostrar el estado de error.
   */
  showErrorState() {
    if (this.hasDownloadButtonTarget) {
      this.downloadButtonTarget.disabled = false;
      this.downloadButtonTarget.className =
        "inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors";
      this.downloadButtonTarget.innerHTML = `
        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
        </svg>
        Retry
      `;
      this.downloadButtonTarget.onclick = () => this.downloadInspection();
    }

    if (this.hasStatusIconTarget) {
      this.statusIconTarget.innerHTML = `
        <svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
        </svg>
      `;
    }

    this.hideProgressBar();
  }

  /**
   * Oculta la barra de progreso.
   */
  hideProgressBar() {
    if (this.hasProgressContainerTarget) {
      this.progressContainerTarget.classList.add("hidden");
    }

    if (this.hasProgressTextTarget) {
      this.progressTextTarget.textContent = "";
    }
  }

  /**
   * Muestra un mensaje de notificación.
   * @param {string} message - El mensaje a mostrar.
   * @param {string} type - El tipo de mensaje (info, success, error).
   */
  showMessage(message, type = "info") {
    // Create notification element
    const notification = document.createElement("div");
    notification.className = `fixed top-4 right-4 z-50 px-6 py-3 rounded-lg text-white font-medium transition-all duration-300 transform translate-x-full`;

    // Set color based on type
    switch (type) {
      case "success":
        notification.classList.add("bg-green-600");
        break;
      case "error":
        notification.classList.add("bg-red-600");
        break;
      case "info":
      default:
        notification.classList.add("bg-blue-600");
        break;
    }

    notification.textContent = message;
    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
      notification.classList.remove("translate-x-full");
    }, 100);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.classList.add("translate-x-full");
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 3000);
  }
}
