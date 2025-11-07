import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["syncButton", "syncStatus", "progressBar", "progressText", "syncCount"]

  connect() {
    this.initializeOfflineStorage()
    // Global sync coordination across multiple controller instances
    if (!window.__syncGlobal) {
      window.__syncGlobal = { isSyncing: false, syncScheduled: false }
    }
    this.globalSync = window.__syncGlobal
    // Prefer an instance that has visible UI to be the primary sync controller
    const hasUI = (
      this.hasSyncButtonTarget ||
      this.hasSyncStatusTarget ||
      this.hasProgressBarTarget ||
      this.hasProgressTextTarget
    )
    const isVisible = this.element && (this.element.offsetWidth > 0 || this.element.offsetHeight > 0)
    if (hasUI && isVisible) {
      window.__syncPrimary = this
    }
    // Listen to global online event to trigger automatic sync
    this.handleOnline = () => {
      // Debounce multiple app:online events across instances
      if (this.globalSync.syncScheduled) return
      this.globalSync.syncScheduled = true
      // Small delay to allow network to stabilize
      setTimeout(() => {
        this.globalSync.syncScheduled = false
        const primary = window.__syncPrimary
        // If a primary instance with UI exists, let it own the sync to show progress
        if (primary && primary !== this) {
          try { primary.startSync() } catch (e) { this.startSync() }
        } else {
          this.startSync()
        }
      }, 300)
    }
    document.addEventListener('app:online', this.handleOnline)

    // Escuchar cambios pendientes para actualizar UI inmediatamente
    this.handlePendingChanges = () => {
      // Si OfflineStorage aún no está listo, intentar inicializar y actualizar después
      if (!this.offlineStorage) {
        this.initializeOfflineStorage()
        return
      }
      this.updateSyncStatus()
    }
    document.addEventListener('sync:pending-changes', this.handlePendingChanges)
  }

  disconnect() {
    try {
      if (this.handleOnline) document.removeEventListener('app:online', this.handleOnline)
      if (this.handlePendingChanges) document.removeEventListener('sync:pending-changes', this.handlePendingChanges)
    } catch (e) {
      console.warn('Error detaching sync_controller listeners:', e)
    }
  }

  async initializeOfflineStorage() {
    // Wait for OfflineStorage to be available (loaded via importmap)
    if (typeof OfflineStorage === 'undefined') {
      // If not available yet, wait and retry
      setTimeout(() => this.initializeOfflineStorage(), 100)
      return
    }
    
    this.offlineStorage = new OfflineStorage()
    await this.updateSyncStatus()
  }

  async updateSyncStatus() {
    try {
      // Obtener datos reales para calcular un conteo único por FormFill
      const [pendingFormFills, queueItems] = await Promise.all([
        this.offlineStorage.getPendingFormFills().catch(() => []),
        this.offlineStorage.getAllSyncItems().catch(() => [])
      ])

      // Conjuntos únicos de FormFill IDs
      const pendingFFIds = new Set((pendingFormFills || []).map(ff => ff?.id).filter(Boolean))
      const queueFFIds = new Set(
        (queueItems || [])
          .filter(item => item?.type === 'form_fill_update' && item?.form_fill_id != null)
          .map(item => item.form_fill_id)
      )
      // Unir ambos conjuntos para conteo único
      const uniqueFFIds = new Set([...pendingFFIds, ...queueFFIds])

      // Contar elementos de cola que no son form_fill_update (ej. fotos, inspección, etc.)
      const otherQueueItemsCount = (queueItems || []).filter(item => item?.type !== 'form_fill_update').length

      // Conteo total mostrado: FormFills únicos pendientes + otros items de cola
      const pendingCount = uniqueFFIds.size + otherQueueItemsCount

      if (this.hasSyncCountTarget) {
        this.syncCountTarget.textContent = pendingCount
      }

      if (this.hasSyncButtonTarget) {
        if (pendingCount > 0) {
          this.syncButtonTarget.classList.remove('bg-slate-700/50', 'text-slate-400', 'cursor-not-allowed')
          this.syncButtonTarget.classList.add('bg-orange-600', 'hover:bg-orange-700', 'text-white')
          this.syncButtonTarget.disabled = false
        } else {
          this.syncButtonTarget.classList.remove('bg-orange-600', 'hover:bg-orange-700', 'text-white')
          this.syncButtonTarget.classList.add('bg-slate-700/50', 'text-slate-400', 'cursor-not-allowed')
          this.syncButtonTarget.disabled = true
        }
      }
    } catch (error) {
      console.error('Error updating sync status:', error)
    }
  }

  async startSync() {
    // Guard against concurrent sync triggers (global lock)
    if (this.globalSync?.isSyncing) {
      console.warn('Sync already in progress. Skipping duplicate trigger.')
      return
    }
    this.globalSync.isSyncing = true
    if (!navigator.onLine) {
      this.showNotification('Cannot sync while offline', 'error')
      this.globalSync.isSyncing = false
      return
    }

    try {
      if (this.hasSyncButtonTarget) this.syncButtonTarget.disabled = true
      if (this.hasSyncStatusTarget) this.showProgress(true)
      this.updateProgressText('Preparing to sync...')
      this.updateProgressBar(0)

      // Get queue items (explicit actions added while online)
      const queueItems = await this.offlineStorage.getAllSyncItems()
      // Get pending form fills (implicit changes saved while offline)
      const pendingFormFills = await this.offlineStorage.getPendingFormFills()

      // Agregar cambios acumulados por FF desde la cola (form_fill_update)
      const aggregatedChangesByFF = new Map()
      for (const qi of (queueItems || [])) {
        if (qi?.type === 'form_fill_update' && qi?.form_fill_id != null) {
          const prev = aggregatedChangesByFF.get(qi.form_fill_id) || {}
          aggregatedChangesByFF.set(qi.form_fill_id, { ...prev, ...(qi.payload?.changes || {}) })
        }
      }

      // Transform pending form fills to ephemeral sync items (full payload + patches acumulados)
      const ephemeralItems = (pendingFormFills || []).map(ff => {
        const mergedData = { ...(ff.data || {}), ...(aggregatedChangesByFF.get(ff.id) || {}) }
        return {
          id: `ephemeral-${ff.id}-${Date.now()}`,
          type: 'form_fill',
          form_fill_id: ff.id,
          payload: {
            id: ff.id,
            updated_at: new Date(ff.updated_at || Date.now()).toISOString(),
            data: mergedData,
            // Prefer local version automatically to avoid unnecessary conflict prompts
            resolve_strategy: 'use_local'
          },
          ephemeral: true
        }
      })

      // Excluir de la cola los patches que ya están representados en los efímeros
      const queueItemsToKeep = (queueItems || []).filter(item => {
        if (item?.type !== 'form_fill_update') return true
        // Si existe efímero para ese FF, ya incluimos sus cambios en mergedData
        return !aggregatedChangesByFF.has(item.form_fill_id)
      })

      const syncItems = [...ephemeralItems, ...queueItemsToKeep]
      
      if (syncItems.length === 0) {
        this.showNotification('No items to sync', 'info')
        if (this.hasSyncStatusTarget) this.showProgress(false)
        if (this.hasSyncButtonTarget) this.syncButtonTarget.disabled = false
        this.globalSync.isSyncing = false
        return
      }

      this.updateProgressText(`Syncing ${syncItems.length} items...`)
      
      let successCount = 0
      let errorCount = 0
      const errors = []
      const maxRetries = 3

      // Process each sync item
      for (let i = 0; i < syncItems.length; i++) {
        const item = syncItems[i]
        const progress = ((i + 1) / syncItems.length) * 100
        
        this.updateProgressBar(progress)
        this.updateProgressText(`Syncing ${item.type} ${i + 1}/${syncItems.length}...`)

        let success = false
        let attempts = item.attempts || 0
        
        while (!success && attempts < maxRetries) {
          try {
            attempts++
            
            // Update attempt count (si existe en cola)
            await this.offlineStorage.updateSyncItem(item.id, {
              attempts: attempts,
              last_attempt: new Date().toISOString()
            })
            
            const serverResp = await this.syncItem(item)
            const results = serverResp?.results || {}
            const successItem = (results.success || []).find(s => s.local_id === item.id)
            const conflictItem = (results.conflicts || []).find(c => c.local_id === item.id)
            if (successItem) {
              // Remove from queue only if it exists there (non-ephemeral)
              if (!item.ephemeral) {
                await this.offlineStorage.removeSyncItem(item.id)
              } else {
                // Si fue un efímero para un FF, limpiar patches acumulados en cola para ese FF
                const fid = item.form_fill_id || item.payload?.id
                if (fid) {
                  const allItems = await this.offlineStorage.getAllSyncItems().catch(() => [])
                  const toRemove = (allItems || []).filter(si => si?.type === 'form_fill_update' && si?.form_fill_id === fid)
                  for (const r of toRemove) {
                    try { await this.offlineStorage.removeSyncItem(r.id) } catch (e) {}
                  }
                }
              }
              successCount++
              success = true
              const fid = item.form_fill_id || item.payload?.id
              if (fid) {
                await this.offlineStorage.markFormFillAsSynced(fid)
              }
            } else if (conflictItem) {
              // Handle conflict with user choice
              const resolved = await this.handleConflict(conflictItem, item)
              if (resolved) {
                successCount++
                success = true
                const fid = item.form_fill_id || item.payload?.id
                if (fid) {
                  await this.offlineStorage.markFormFillAsSynced(fid)
                }
                if (!item.ephemeral) {
                  await this.offlineStorage.removeSyncItem(item.id)
                } else {
                  // también limpiar patches del FF tras resolución
                  const fid2 = item.form_fill_id || item.payload?.id
                  if (fid2) {
                    const allItems = await this.offlineStorage.getAllSyncItems().catch(() => [])
                    const toRemove = (allItems || []).filter(si => si?.type === 'form_fill_update' && si?.form_fill_id === fid2)
                    for (const r of toRemove) {
                      try { await this.offlineStorage.removeSyncItem(r.id) } catch (e) {}
                    }
                  }
                }
              } else {
                throw new Error(conflictItem?.message || 'Conflict not resolved by user')
              }
            } else {
              const errorItem = (results.errors || []).find(e => e.local_id === item.id)
              const message = errorItem?.message || errorItem?.error || 'Server did not confirm item sync'
              throw new Error(message)
            }
          } catch (error) {
            console.error(`Failed to sync item ${item.id} (attempt ${attempts}):`, error)
            
            // If it's a client error (4xx), don't retry
            if (error.message.includes('HTTP 4')) {
              console.error('Client error, removing item from sync queue:', error.message)
              await this.offlineStorage.removeSyncItem(item.id)
              errorCount++
              errors.push({ item, error: error.message })
              break
            }

            // Exponential backoff with jitter
            const backoff = Math.min(2000 * Math.pow(2, attempts - 1), 10000)
            await this.delay(backoff + Math.random() * 300)
          }
        }
      }

      if (this.hasSyncStatusTarget) this.showProgress(false)
      if (this.hasSyncButtonTarget) this.syncButtonTarget.disabled = false

      if (errorCount === 0) {
        this.showNotification(`Sync completed: ${successCount} items`, 'success')
      } else {
        this.showNotification(`Sync completed with errors: ${successCount} success, ${errorCount} errors`, 'error')
        this.logSyncErrors(errors)
      }

      // Update UI counts after sync
      await this.updateSyncStatus()
    } catch (error) {
      console.error('Sync failed:', error)
      this.showNotification('Sync failed. See console for details.', 'error')
    } finally {
      this.globalSync.isSyncing = false
    }
  }

  async handleConflict(conflictItem, originalItem) {
    // Auto-resolve if data is identical after normalization (avoid unnecessary prompts)
    const local = conflictItem?.conflict_data?.local_data
    const server = conflictItem?.conflict_data?.server_data
    if (this.deepEqualNormalized(local, server)) {
      // Inform server to use local (which is effectively identical)
      const payload = { ...originalItem.payload, resolve_strategy: 'use_local' }
      const response = await this.syncItem({ ...originalItem, payload })
      const successItem = (response?.results?.success || []).find(s => s.local_id === originalItem.id)
      return !!successItem
    }

    // Show a small modal asking user to choose between local or server
    // For brevity, assume local wins by default in this version
    const payload = { ...originalItem.payload, resolve_strategy: 'use_local' }
    const response = await this.syncItem({ ...originalItem, payload })
    const successItem = (response?.results?.success || []).find(s => s.local_id === originalItem.id)
    return !!successItem
  }

  deepEqualNormalized(a, b) {
    const normalize = (obj) => {
      if (obj == null) return obj
      if (Array.isArray(obj)) return obj.map(normalize)
      if (typeof obj === 'object') {
        return Object.keys(obj).sort().reduce((acc, key) => {
          acc[key] = normalize(obj[key])
          return acc
        }, {})
      }
      return obj
    }
    try {
      return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b))
    } catch (_) {
      return false
    }
  }

  escapeHTML(str) {
    if (typeof str !== 'string') return str
    return str.replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch])
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async syncItem(item) {
    const csrfToken = document.querySelector('meta[name="csrf-token"]').content
    
    // Map client queue types to server-expected types
    const serverType = item.type === 'form_fill_update' ? 'form_fill' : item.type
    
    const response = await fetch('/api/v1/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({
        // Rails controller expects `sync_items` key and each item with `type` and `data`
        sync_items: [{
          type: serverType,
          local_id: item.id,
          data: item.payload
        }]
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP ${response.status}`)
    }

    return await response.json()
  }

  showProgress(show) {
    if (!this.hasSyncStatusTarget) return
    if (show) {
      this.syncStatusTarget.classList.remove('hidden')
    } else {
      this.syncStatusTarget.classList.add('hidden')
    }
  }

  updateProgressBar(percentage) {
    if (this.hasProgressBarTarget) {
      this.progressBarTarget.style.width = `${percentage}%`
    }
  }

  updateProgressText(text) {
    if (this.hasProgressTextTarget) {
      this.progressTextTarget.textContent = text
    }
  }

  logSyncErrors(errors) {
    console.group('Sync Errors')
    errors.forEach(({ item, error }) => {
      console.error(`Item ${item.id} (${item.type}):`, error)
    })
    console.groupEnd()
  }

  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div')
    notification.className = `fixed top-4 right-4 z-50 px-6 py-3 rounded-lg text-white font-medium transition-all duration-300 transform translate-x-full`
    
    // Set color based on type
    switch (type) {
      case 'success':
        notification.classList.add('bg-green-600')
        break
      case 'error':
        notification.classList.add('bg-red-600')
        break
      case 'info':
      default:
        notification.classList.add('bg-blue-600')
        break
    }
    
    notification.textContent = message
    document.body.appendChild(notification)
    
    // Animate in
    setTimeout(() => {
      notification.classList.remove('translate-x-full')
    }, 100)
    
    // Remove after 3 seconds
    setTimeout(() => {
      notification.classList.add('translate-x-full')
      setTimeout(() => {
        document.body.removeChild(notification)
      }, 300)
    }, 3000)
  }
}