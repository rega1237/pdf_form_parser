import { Controller } from "@hotwired/stimulus"
export default class extends Controller {
  static targets = ["form", "status", "saveIndicator"]
  static values = { 
    formFillId: String,
    inspectionId: String,
    autoSaveInterval: { type: Number, default: 30000 }
  }

  connect() {
    this.isOnline = navigator.onLine
    this.hasUnsavedChanges = false
    this.autoSaveTimer = null
    this.lastSaveTime = null
    
    // Bind methods to preserve context
    this.handleOnline = this.handleOnline.bind(this)
    this.handleOffline = this.handleOffline.bind(this)
    this.handleFormChange = this.handleFormChange.bind(this)
    this.handleBeforeUnload = this.handleBeforeUnload.bind(this)
    
    this.setupEventListeners()
    this.initializeOfflineStorage()
    this.updateConnectionStatus()
    this.startAutoSave()
    
    console.log('[OfflineForm] Controller connected', {
      formFillId: this.formFillIdValue,
      inspectionId: this.inspectionIdValue,
      isOnline: this.isOnline
    })
  }

  async initializeOfflineStorage() {
    // Wait for OfflineStorage to be available (loaded via importmap)
    if (typeof OfflineStorage === 'undefined') {
      // If not available yet, wait and retry
      setTimeout(() => this.initializeOfflineStorage(), 100)
      return
    }
    
    this.offlineStorage = new OfflineStorage()
    await this.loadOfflineData()
  }

  disconnect() {
    this.cleanup()
  }

  setupEventListeners() {
    // Network status listeners
    window.addEventListener('online', this.handleOnline)
    window.addEventListener('offline', this.handleOffline)
    
    // Form change listeners
    if (this.hasFormTarget) {
      this.formTarget.addEventListener('input', this.handleFormChange)
      this.formTarget.addEventListener('change', this.handleFormChange)
    }
    
    // Page unload listener
    window.addEventListener('beforeunload', this.handleBeforeUnload)
  }

  cleanup() {
    window.removeEventListener('online', this.handleOnline)
    window.removeEventListener('offline', this.handleOffline)
    window.removeEventListener('beforeunload', this.handleBeforeUnload)
    
    if (this.hasFormTarget) {
      this.formTarget.removeEventListener('input', this.handleFormChange)
      this.formTarget.removeEventListener('change', this.handleFormChange)
    }
    
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer)
    }
  }

  handleOnline() {
    this.isOnline = true
    this.updateConnectionStatus()
    this.syncPendingChanges()
  }

  handleOffline() {
    this.isOnline = false
    this.updateConnectionStatus()
  }

  handleFormChange(event) {
    this.hasUnsavedChanges = true
    this.updateSaveIndicator('unsaved')
    
    // Debounce form changes to avoid excessive saves
    clearTimeout(this.changeTimeout)
    this.changeTimeout = setTimeout(() => {
      this.saveFormData()
    }, 2000) // Save after 2 seconds of inactivity
  }

  handleBeforeUnload(event) {
    if (this.hasUnsavedChanges) {
      const message = 'You have unsaved changes. Are you sure you want to leave?'
      event.returnValue = message
      return message
    }
  }

  startAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer)
    }
    
    this.autoSaveTimer = setInterval(() => {
      if (this.hasUnsavedChanges) {
        this.saveFormData()
      }
    }, this.autoSaveIntervalValue)
  }

  async loadOfflineData() {
    try {
      const offlineData = await this.offlineStorage.getFormFillData(this.formFillIdValue)
      
      if (offlineData && offlineData.form_data) {
        this.populateFormWithData(offlineData.form_data)
        this.updateSaveIndicator('loaded')
        console.log('[OfflineForm] Loaded offline data', offlineData)
      }
    } catch (error) {
      console.error('[OfflineForm] Error loading offline data:', error)
    }
  }

  async saveFormData() {
    try {
      this.updateSaveIndicator('saving')
      
      const formData = this.extractFormData()
      const timestamp = new Date().toISOString()
      
      // Save to IndexedDB
      await this.offlineStorage.storeFormFillData(this.formFillIdValue, {
        id: this.formFillIdValue,
        inspection_id: this.inspectionIdValue,
        form_data: formData,
        last_modified: timestamp,
        status: 'draft'
      })
      
      // If online, also sync to server
      if (this.isOnline) {
        await this.syncToServer(formData)
      } else {
        // Add to sync queue for later
        await this.offlineStorage.addToSyncQueue('form_fill_update', {
          id: this.formFillIdValue,
          form_data: formData,
          timestamp: timestamp
        })
      }
      
      this.hasUnsavedChanges = false
      this.lastSaveTime = new Date()
      this.updateSaveIndicator('saved')
      
      console.log('[OfflineForm] Form data saved', { formData, timestamp })
      
    } catch (error) {
      console.error('[OfflineForm] Error saving form data:', error)
      this.updateSaveIndicator('error')
    }
  }

  async syncToServer(formData) {
    try {
      const response = await fetch(`/form_fills/${this.formFillIdValue}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.querySelector('[name="csrf-token"]').content
        },
        body: JSON.stringify({
          form_fill: {
            data: formData
          }
        })
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      console.log('[OfflineForm] Successfully synced to server')
      
    } catch (error) {
      console.error('[OfflineForm] Error syncing to server:', error)
      
      // Add to sync queue for retry
      await this.offlineStorage.addToSyncQueue('form_fill_update', {
        id: this.formFillIdValue,
        form_data: formData,
        timestamp: new Date().toISOString()
      })
      
      throw error
    }
  }

  async syncPendingChanges() {
    if (!this.isOnline) return
    
    try {
      const syncItems = await this.offlineStorage.getAllSyncItems()
      const formFillItems = syncItems.filter(item => 
        item.type === 'form_fill_update' && 
        item.data.id === this.formFillIdValue
      )
      
      for (const item of formFillItems) {
        try {
          await this.syncToServer(item.data.form_data)
          await this.offlineStorage.removeSyncItem(item.id)
        } catch (error) {
          console.error('[OfflineForm] Error syncing pending item:', error)
        }
      }
      
    } catch (error) {
      console.error('[OfflineForm] Error syncing pending changes:', error)
    }
  }

  extractFormData() {
    if (!this.hasFormTarget) return {}
    
    const formData = new FormData(this.formTarget)
    const data = {}
    
    // Convert FormData to plain object
    for (const [key, value] of formData.entries()) {
      // Handle form_fill[data][field_name] format
      if (key.startsWith('form_fill[data]')) {
        const fieldName = key.match(/form_fill\[data\]\[(.+)\]/)?.[1]
        if (fieldName) {
          data[fieldName] = value
        }
      } else if (key.startsWith('form_fill[')) {
        // Handle other form_fill fields
        const fieldName = key.match(/form_fill\[(.+)\]/)?.[1]
        if (fieldName && fieldName !== 'data') {
          data[fieldName] = value
        }
      }
    }
    
    return data
  }

  populateFormWithData(data) {
    if (!this.hasFormTarget || !data) return
    
    Object.entries(data).forEach(([fieldName, value]) => {
      // Try different field name formats
      const selectors = [
        `[name="form_fill[data][${fieldName}]"]`,
        `[name="form_fill[${fieldName}]"]`,
        `#form_fill_${fieldName}`,
        `[data-field-name="${fieldName}"]`
      ]
      
      for (const selector of selectors) {
        const field = this.formTarget.querySelector(selector)
        if (field) {
          if (field.type === 'checkbox' || field.type === 'radio') {
            field.checked = field.value === value
          } else {
            field.value = value
          }
          
          // Trigger change event to update any dependent UI
          field.dispatchEvent(new Event('change', { bubbles: true }))
          break
        }
      }
    })
  }

  updateConnectionStatus() {
    if (this.hasStatusTarget) {
      this.statusTarget.textContent = this.isOnline ? 'Online' : 'Offline'
      this.statusTarget.className = this.isOnline 
        ? 'px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium'
        : 'px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium'
    }
  }

  updateSaveIndicator(status) {
    if (!this.hasSaveIndicatorTarget) return
    
    const indicator = this.saveIndicatorTarget
    const now = new Date()
    
    switch (status) {
      case 'saving':
        indicator.innerHTML = `
          <div class="flex items-center text-blue-600">
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Saving...
          </div>
        `
        break
        
      case 'saved':
        indicator.innerHTML = `
          <div class="flex items-center text-green-600">
            <svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            Saved ${this.formatTime(now)}
          </div>
        `
        break
        
      case 'unsaved':
        indicator.innerHTML = `
          <div class="flex items-center text-yellow-600">
            <svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
            </svg>
            Unsaved changes
          </div>
        `
        break
        
      case 'error':
        indicator.innerHTML = `
          <div class="flex items-center text-red-600">
            <svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            Save failed
          </div>
        `
        break
        
      case 'loaded':
        indicator.innerHTML = `
          <div class="flex items-center text-blue-600">
            <svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"></path>
            </svg>
            Loaded offline data
          </div>
        `
        break
    }
  }

  formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Action methods for manual operations
  async forceSave() {
    await this.saveFormData()
  }

  async forceSync() {
    if (this.isOnline) {
      await this.syncPendingChanges()
    }
  }

  clearOfflineData() {
    if (confirm('Are you sure you want to clear offline data? This cannot be undone.')) {
      this.offlineStorage.removeFormFillData(this.formFillIdValue)
      this.updateSaveIndicator('cleared')
    }
  }
}