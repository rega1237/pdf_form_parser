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
      const stats = await this.offlineStorage.getStorageStats()
      // Considerar elementos en cola y cambios pendientes guardados offline
      const pendingCount = (stats.syncQueue || 0) + (stats.pendingChangesCount || 0)
      
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

      // Transform pending form fills to ephemeral sync items
      const ephemeralItems = (pendingFormFills || []).map(ff => ({
        id: `ephemeral-${ff.id}-${Date.now()}`,
        type: 'form_fill',
        form_fill_id: ff.id,
        payload: {
          id: ff.id,
          updated_at: new Date(ff.updated_at || Date.now()).toISOString(),
          data: ff.data
        },
        ephemeral: true
      }))
      const syncItems = [...ephemeralItems, ...(queueItems || [])]
      
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
            
            // Update attempt count
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
            
            // For server errors (5xx), wait before retry
            if (attempts < maxRetries) {
              await this.delay(1000 * attempts) // Exponential backoff
            }
          }
        }
        
        // If all retries failed
        if (!success && attempts >= maxRetries) {
          errorCount++
          errors.push({ item, error: 'Max retries exceeded' })
          // Mark item as failed but keep in queue for manual retry
          await this.offlineStorage.updateSyncItem(item.id, {
            status: 'failed',
            last_error: 'Max retries exceeded'
          })
        }
      }

      // Show results
      this.updateProgressBar(100)
      this.updateProgressText('Sync complete!')

      setTimeout(() => {
        if (this.hasSyncStatusTarget) this.showProgress(false)
        this.updateSyncStatus()
        
        if (errorCount === 0) {
          this.showNotification(`Successfully synced ${successCount} items`, 'success')
        } else {
          this.showNotification(`Synced ${successCount} items, ${errorCount} failed`, 'error')
          this.logSyncErrors(errors)
        }
      }, 1000)
      // Allow future sync runs (global)
      this.globalSync.isSyncing = false

    } catch (error) {
      console.error('Sync failed:', error)
      if (this.hasSyncStatusTarget) this.showProgress(false)
      if (this.hasSyncButtonTarget) this.syncButtonTarget.disabled = false
      this.showNotification('Sync failed. Please try again.', 'error')
      this.globalSync.isSyncing = false
    }
  }

  async handleConflict(conflictItem, originalItem) {
    return new Promise(async (resolve) => {
      const { conflict_data } = conflictItem
      const localData = conflict_data?.local_data || {}
      const serverData = conflict_data?.server_data || {}
      const serverStructure = conflict_data?.server_form_structure || null
      const formFillId = originalItem.form_fill_id || originalItem.payload?.id

      // Auto-resolve when local and server data are identical (ignoring key order)
      try {
        if (this.deepEqualNormalized(localData, serverData)) {
          await this.offlineStorage.markFormFillAsSynced(formFillId)
          this.showNotification(`FormFill #${formFillId} synced (no differences)`, 'success')
          resolve(true)
          return
        }
      } catch (e) {
        console.warn('Failed to compare conflict payloads, showing modal instead:', e)
      }

      // Build modal UI
      const modal = document.createElement('div')
      modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50'
      modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl w-full max-w-3xl">
          <div class="px-6 py-4 border-b">
            <h2 class="text-lg font-semibold">Conflict detected for FormFill #${formFillId}</h2>
            <p class="text-sm text-slate-600">Server and local versions differ. Choose which version to keep.</p>
          </div>
          <div class="p-6 grid grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto">
            <div>
              <h3 class="font-medium mb-2">Local version</h3>
              <pre class="text-xs bg-slate-50 border rounded p-2 overflow-x-auto">${this.escapeHTML(JSON.stringify(localData, null, 2))}</pre>
            </div>
            <div>
              <h3 class="font-medium mb-2">Server version</h3>
              <pre class="text-xs bg-slate-50 border rounded p-2 overflow-x-auto">${this.escapeHTML(JSON.stringify(serverData, null, 2))}</pre>
            </div>
          </div>
          <div class="px-6 py-4 border-t flex justify-end gap-3">
            <button data-action="cancel" class="px-4 py-2 rounded border bg-white text-slate-700 hover:bg-slate-50">Cancel</button>
            <button data-action="use-server" class="px-4 py-2 rounded bg-slate-600 text-white hover:bg-slate-700">Use Server</button>
            <button data-action="use-local" class="px-4 py-2 rounded bg-orange-600 text-white hover:bg-orange-700">Keep Local</button>
          </div>
        </div>
      `
      document.body.appendChild(modal)

      const closeModal = () => {
        try { document.body.removeChild(modal) } catch {}
      }

      modal.addEventListener('click', async (e) => {
        const action = e.target?.dataset?.action
        if (!action) return
        e.preventDefault()

        if (action === 'cancel') {
          closeModal()
          resolve(false)
          return
        }

        if (action === 'use-server') {
          // Update local IndexedDB with server data and structure
          try {
            const db = await this.offlineStorage.openDB()
            const tx = db.transaction(['form_fills'], 'readwrite')
            const store = tx.objectStore('form_fills')
            const ff = await this.offlineStorage.promisifyRequest(store.get(formFillId))
            if (ff) {
              ff.data = serverData
              if (serverStructure) ff.form_structure = serverStructure
              ff.has_pending_changes = false
              ff.updated_at = Date.now()
              await this.offlineStorage.promisifyRequest(store.put(ff))
            }
            closeModal()
            resolve(true)
          } catch (err) {
            console.error('Failed to apply server version locally:', err)
            closeModal()
            resolve(false)
          }
          return
        }

        if (action === 'use-local') {
          // Send resolution to server to override with local data
          try {
            const resolutionItem = {
              id: `${originalItem.id}-resolve`,
              type: 'form_fill',
              payload: {
                id: formFillId,
                updated_at: new Date().toISOString(),
                resolve_strategy: 'use_local',
                data: localData
              }
            }
            const resp = await this.syncItem(resolutionItem)
            const results = resp?.results || {}
            const successItem = (results.success || []).find(s => s.local_id === resolutionItem.id)
            if (successItem) {
              closeModal()
              resolve(true)
              return
            }
            const errorItem = (results.errors || []).find(e => e.local_id === resolutionItem.id)
            if (errorItem) throw new Error(errorItem?.message || errorItem?.error || 'Server rejected resolution')
          } catch (err) {
            console.error('Failed to push local version to server:', err)
            closeModal()
            resolve(false)
          }
        }
      })
    })
  }

  // Deeply compare two values, normalizing object key order for stable equality checks
  deepEqualNormalized(a, b) {
    const normalize = (val) => {
      if (Array.isArray(val)) {
        return val.map(normalize)
      } else if (val && typeof val === 'object') {
        const keys = Object.keys(val).sort()
        const obj = {}
        for (const k of keys) obj[k] = normalize(val[k])
        return obj
      }
      return val
    }
    try {
      const na = normalize(a)
      const nb = normalize(b)
      return JSON.stringify(na) === JSON.stringify(nb)
    } catch {
      return false
    }
  }

  escapeHTML(str) {
    try {
      return str.replace(/[&<>'\"/]/g, function (c) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
          '/': '&#x2F;'
        }[c]
      })
    } catch { return str }
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