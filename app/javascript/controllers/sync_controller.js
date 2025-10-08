import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["syncButton", "syncStatus", "progressBar", "progressText", "syncCount"]

  connect() {
    this.initializeOfflineStorage()
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
      const pendingCount = stats.syncQueue || 0
      
      if (this.hasSyncCountTarget) {
        this.syncCountTarget.textContent = pendingCount
      }

      if (pendingCount > 0) {
        this.syncButtonTarget.classList.remove('bg-gray-600')
        this.syncButtonTarget.classList.add('bg-orange-600', 'hover:bg-orange-700')
        this.syncButtonTarget.disabled = false
      } else {
        this.syncButtonTarget.classList.remove('bg-orange-600', 'hover:bg-orange-700')
        this.syncButtonTarget.classList.add('bg-gray-600')
        this.syncButtonTarget.disabled = true
      }
    } catch (error) {
      console.error('Error updating sync status:', error)
    }
  }

  async startSync() {
    if (!navigator.onLine) {
      this.showNotification('Cannot sync while offline', 'error')
      return
    }

    try {
      this.syncButtonTarget.disabled = true
      this.showProgress(true)
      this.updateProgressText('Preparing to sync...')
      this.updateProgressBar(0)

      // Get all pending sync items
      const syncItems = await this.offlineStorage.getAllSyncItems()
      
      if (syncItems.length === 0) {
        this.showNotification('No items to sync', 'info')
        this.showProgress(false)
        this.syncButtonTarget.disabled = false
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
            
            await this.syncItem(item)
            await this.offlineStorage.removeSyncItem(item.id)
            successCount++
            success = true
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
        this.showProgress(false)
        this.updateSyncStatus()
        
        if (errorCount === 0) {
          this.showNotification(`Successfully synced ${successCount} items`, 'success')
        } else {
          this.showNotification(`Synced ${successCount} items, ${errorCount} failed`, 'error')
          this.logSyncErrors(errors)
        }
      }, 1000)

    } catch (error) {
      console.error('Sync failed:', error)
      this.showProgress(false)
      this.syncButtonTarget.disabled = false
      this.showNotification('Sync failed. Please try again.', 'error')
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async syncItem(item) {
    const csrfToken = document.querySelector('meta[name="csrf-token"]').content
    
    const response = await fetch('/api/v1/sync/sync_data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({
        items: [item.data]
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP ${response.status}`)
    }

    return await response.json()
  }

  showProgress(show) {
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