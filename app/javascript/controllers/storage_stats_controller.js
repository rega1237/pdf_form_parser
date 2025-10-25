import { Controller } from "@hotwired/stimulus"
import OfflineStorage from "utils/offline_storage"

// Controlador para mostrar estadísticas de almacenamiento de IndexedDB
export default class extends Controller {
  static targets = [
    "usageText",
    "quotaText",
    "percentageText",
    "progressBar",
    "detailsText"
  ]

  connect() {
    this.offlineStorage = new OfflineStorage()
    this.updateStats()
  }

  async updateStats() {
    try {
      const stats = await this.offlineStorage.getStorageStats()
      const usageText = this.formatBytes(stats.usage || 0)
      const quotaText = this.formatBytes(stats.quota || 0)
      const percent = Number(stats.usagePercentage || 0)

      if (this.hasUsageTextTarget) {
        this.usageTextTarget.textContent = usageText
      }
      if (this.hasQuotaTextTarget) {
        this.quotaTextTarget.textContent = quotaText
      }
      if (this.hasPercentageTextTarget) {
        this.percentageTextTarget.textContent = `${percent}%`
      }
      if (this.hasProgressBarTarget) {
        this.progressBarTarget.style.width = `${percent}%`
        // Cambiar color según nivel de uso
        this.progressBarTarget.classList.remove('bg-emerald-600', 'bg-orange-600', 'bg-red-600')
        if (percent < 60) {
          this.progressBarTarget.classList.add('bg-emerald-600')
        } else if (percent < 85) {
          this.progressBarTarget.classList.add('bg-orange-600')
        } else {
          this.progressBarTarget.classList.add('bg-red-600')
        }
      }

      if (this.hasDetailsTextTarget) {
        this.detailsTextTarget.innerHTML = `
          <span class="mr-4">Inspecciones offline: <span class="font-semibold text-white">${stats.inspectionsCount}</span></span>
          <span class="mr-4">Pending changes: <span class="font-semibold text-white">${stats.pendingChangesCount}</span></span>
          <span>Sync queue: <span class="font-semibold text-white">${stats.syncQueue}</span></span>
        `
      }
    } catch (error) {
      console.error('[StorageStats] Error obteniendo estadísticas:', error)
      if (this.hasDetailsTextTarget) {
        this.detailsTextTarget.textContent = 'No se pudieron obtener las estadísticas de almacenamiento'
      }
    }
  }

  refresh() {
    this.updateStats()
  }

  formatBytes(bytes) {
    if (bytes === 0 || !Number.isFinite(bytes)) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    const value = (bytes / Math.pow(k, i)).toFixed(2)
    return `${value} ${sizes[i]}`
  }
}