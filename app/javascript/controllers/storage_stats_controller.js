import { Controller } from "@hotwired/stimulus";
import OfflineStorage from "utils/offline_storage";

// Controlador para mostrar estadísticas de almacenamiento de IndexedDB
export default class extends Controller {
  static targets = [
    "usageText",
    "quotaText",
    "percentageText",
    "progressBar",
    "detailsText",
  ];

  connect() {
    this.offlineStorage = new OfflineStorage();
    this.updateStats();
  }

  async updateStats() {
    try {
      const stats = await this.offlineStorage.getStorageStats();
      const usageText = this.formatBytes(stats.usage || 0);
      const quotaText = this.formatBytes(stats.quota || 0);
      const percent = Number(stats.usagePercentage || 0);

      if (this.hasUsageTextTarget) {
        this.usageTextTarget.textContent = usageText;
      }
      if (this.hasQuotaTextTarget) {
        this.quotaTextTarget.textContent = quotaText;
      }
      if (this.hasPercentageTextTarget) {
        this.percentageTextTarget.textContent = `${percent}%`;
      }
      if (this.hasProgressBarTarget) {
        this.progressBarTarget.style.width = `${percent}%`;
        // Cambiar color según nivel de uso
        this.progressBarTarget.classList.remove(
          "bg-emerald-600",
          "bg-orange-600",
          "bg-red-600",
        );
        if (percent < 60) {
          this.progressBarTarget.classList.add("bg-emerald-600");
        } else if (percent < 85) {
          this.progressBarTarget.classList.add("bg-orange-600");
        } else {
          this.progressBarTarget.classList.add("bg-red-600");
        }
      }

      if (this.hasDetailsTextTarget) {
        this.detailsTextTarget.innerHTML = `
          <span class="mr-4">Inspecciones offline: <span class="font-semibold text-white">${stats.inspectionsCount}</span></span>
          <span class="mr-4">Pending changes: <span class="font-semibold text-white">${stats.pendingChangesCount}</span></span>
          <span>Sync queue: <span class="font-semibold text-white">${stats.syncQueue}</span></span>
        `;
      }
    } catch (error) {
      console.error("[StorageStats] Error obteniendo estadísticas:", error);
      if (this.hasDetailsTextTarget) {
        this.detailsTextTarget.textContent =
          "No se pudieron obtener las estadísticas de almacenamiento";
      }
    }
  }

  refresh() {
    this.updateStats();
  }

  async cleanAll(event) {
    if (
      !confirm(
        "Are you sure you want to delete ALL offline data?\n\nThis will permanently remove:\n- All downloaded inspections\n- All pending form changes\n- All offline photos\n\n(App core files will be preserved to avoid re-download)\n\nThis action cannot be undone.",
      )
    ) {
      return;
    }

    const button = event.currentTarget;
    const originalContent = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `
      <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-red-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Cleaning...
    `;

    try {
      console.log("[StorageStats] Starting full cleanup...");

      // 1. Limpiar IndexedDB (destruir base de datos)
      await this.offlineStorage.clearAllData();
      console.log("[StorageStats] IndexedDB deleted");

      // 2. Limpiar Caché (Service Worker)
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        await new Promise((resolve) => {
          const channel = new MessageChannel();
          channel.port1.onmessage = () => {
            console.log("[StorageStats] Cache cleared by SW");
            resolve();
          };

          navigator.serviceWorker.controller.postMessage(
            { type: "CLEAR_ALL_CACHE" },
            [channel.port2],
          );

          // Timeout de seguridad (más largo porque puede haber muchos archivos)
          setTimeout(resolve, 3000);
        });
      }

      // 3. Recargar para reiniciar todo
      console.log("[StorageStats] Cleanup complete. Reloading...");
      window.location.reload();
    } catch (error) {
      console.error("[StorageStats] Error during cleanup:", error);
      alert("Error clearing data: " + error.message);
      button.disabled = false;
      button.innerHTML = originalContent;
    }
  }

  formatBytes(bytes) {
    if (bytes === 0 || !Number.isFinite(bytes)) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = (bytes / Math.pow(k, i)).toFixed(2);
    return `${value} ${sizes[i]}`;
  }
}
