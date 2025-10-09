/**
 * OfflineStorage - Maneja el almacenamiento offline usando IndexedDB
 * 
 * Esquema de la base de datos:
 * - inspections: Datos de inspecciones descargadas
 * - form_fills: Datos de formularios y sus respuestas
 * - sync_queue: Cola de elementos pendientes de sincronización
 */
class OfflineStorage {
  constructor() {
    this.dbName = 'aes_pro_offline'
    this.version = 1
    this.db = null
  }

  /**
   * Almacena un form_fill individual
   */
  async storeFormFill(formFill) {
    const db = await this.openDB()
    const tx = db.transaction(['form_fills'], 'readwrite')
    
    try {
      const formFillToStore = {
        ...formFill,
        photos: formFill.photos || {},
        synced_at: Date.now(),
        has_pending_changes: false
      }

      await this.promisifyRequest(
        tx.objectStore('form_fills').put(formFillToStore)
      )
      
      console.log(`[OfflineStorage] Stored form fill ${formFill.id}`)
      return true
    } catch (error) {
      console.error('[OfflineStorage] Error storing form fill:', error)
      throw error
    }
  }

  /**
   * Abre la conexión a IndexedDB y crea el esquema si es necesario
   */
  async openDB() {
    if (this.db) return this.db

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version)

      request.onerror = () => {
        console.error('[OfflineStorage] Error opening database:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        console.log('[OfflineStorage] Database opened successfully')
        resolve(this.db)
      }

      request.onupgradeneeded = (event) => {
        const db = event.target.result
        console.log('[OfflineStorage] Upgrading database schema')

        // Object Store: inspections
        if (!db.objectStoreNames.contains('inspections')) {
          const inspectionsStore = db.createObjectStore('inspections', { keyPath: 'id' })
          inspectionsStore.createIndex('downloaded_at', 'downloaded_at', { unique: false })
          inspectionsStore.createIndex('has_pending_changes', 'has_pending_changes', { unique: false })
          console.log('[OfflineStorage] Created inspections object store')
        }

        // Object Store: form_fills
        if (!db.objectStoreNames.contains('form_fills')) {
          const formFillsStore = db.createObjectStore('form_fills', { keyPath: 'id' })
          formFillsStore.createIndex('inspection_id', 'inspection_id', { unique: false })
          formFillsStore.createIndex('has_pending_changes', 'has_pending_changes', { unique: false })
          formFillsStore.createIndex('updated_at', 'updated_at', { unique: false })
          console.log('[OfflineStorage] Created form_fills object store')
        }

        // Object Store: photos
        if (!db.objectStoreNames.contains('photos')) {
          const photosStore = db.createObjectStore('photos', { keyPath: 'id' })
          photosStore.createIndex('metadata.stored_at', 'metadata.stored_at', { unique: false })
          photosStore.createIndex('metadata.type', 'metadata.type', { unique: false })
          console.log('[OfflineStorage] Created photos object store')
        }

        // Object Store: form_templates
        if (!db.objectStoreNames.contains('form_templates')) {
          const formTemplatesStore = db.createObjectStore('form_templates', { keyPath: 'id' })
          formTemplatesStore.createIndex('name', 'name', { unique: false })
          formTemplatesStore.createIndex('stored_at', 'stored_at', { unique: false })
          console.log('[OfflineStorage] Created form_templates object store')
        }

        // Object Store: sync_queue
        if (!db.objectStoreNames.contains('sync_queue')) {
          const syncQueueStore = db.createObjectStore('sync_queue', { keyPath: 'id' })
          syncQueueStore.createIndex('type', 'type', { unique: false })
          syncQueueStore.createIndex('created_at', 'created_at', { unique: false })
          syncQueueStore.createIndex('retry_count', 'retry_count', { unique: false })
          console.log('[OfflineStorage] Created sync_queue object store')
        }
      }
    })
  }

  /**
   * Almacena una inspección completa con sus form_fills
   */
  async storeInspection(inspectionData) {
    console.log('[OfflineStorage] Starting storeInspection with data:', inspectionData)
    
    const db = await this.openDB()
    console.log('[OfflineStorage] Database opened successfully')
    
    const tx = db.transaction(['inspections', 'form_fills', 'form_templates'], 'readwrite')
    console.log('[OfflineStorage] Transaction created')

    try {
      // Almacenar inspección
      const inspectionToStore = {
        ...inspectionData.inspection,
        downloaded_at: Date.now(),
        synced_at: Date.now(),
        has_pending_changes: false
      }
      
      console.log('[OfflineStorage] Storing inspection:', inspectionToStore)
      const inspectionResult = await this.promisifyRequest(
        tx.objectStore('inspections').put(inspectionToStore)
      )
      console.log('[OfflineStorage] Inspection stored with result:', inspectionResult)

      // Almacenar form_fills
      if (inspectionData.form_fills && inspectionData.form_fills.length > 0) {
        console.log(`[OfflineStorage] Storing ${inspectionData.form_fills.length} form fills`)
        const formFillsStore = tx.objectStore('form_fills')
        
        for (let i = 0; i < inspectionData.form_fills.length; i++) {
          const formFill = inspectionData.form_fills[i]
          const formFillToStore = {
            ...formFill,
            photos: formFill.photos || {},
            synced_at: Date.now(),
            has_pending_changes: false
          }

          console.log(`[OfflineStorage] Storing form fill ${i + 1}/${inspectionData.form_fills.length}:`, formFillToStore)
          const formFillResult = await this.promisifyRequest(formFillsStore.put(formFillToStore))
          console.log(`[OfflineStorage] Form fill ${i + 1} stored with result:`, formFillResult)
        }
      }

      // Almacenar form_templates
      if (inspectionData.form_templates && inspectionData.form_templates.length > 0) {
        console.log(`[OfflineStorage] Storing ${inspectionData.form_templates.length} form templates`)
        const formTemplatesStore = tx.objectStore('form_templates')
        
        for (let i = 0; i < inspectionData.form_templates.length; i++) {
          const template = inspectionData.form_templates[i]
          const templateToStore = {
            ...template,
            stored_at: Date.now()
          }

          console.log(`[OfflineStorage] Storing template ${i + 1}/${inspectionData.form_templates.length}:`, templateToStore)
          const templateResult = await this.promisifyRequest(formTemplatesStore.put(templateToStore))
          console.log(`[OfflineStorage] Template ${i + 1} stored with result:`, templateResult)
        }
      }

      console.log('[OfflineStorage] Waiting for transaction to complete...')
      // Esperar a que la transacción se complete usando el evento
      await new Promise((resolve, reject) => {
        tx.oncomplete = () => {
          console.log('[OfflineStorage] Transaction completed successfully')
          resolve()
        }
        tx.onerror = () => {
          console.error('[OfflineStorage] Transaction error:', tx.error)
          reject(tx.error)
        }
        tx.onabort = () => {
          console.error('[OfflineStorage] Transaction aborted')
          reject(new Error('Transaction aborted'))
        }
      })
      
      console.log(`[OfflineStorage] Stored inspection ${inspectionData.inspection.id} with ${inspectionData.form_fills?.length || 0} form fills and ${inspectionData.form_templates?.length || 0} form templates`)
      
      return true
    } catch (error) {
      console.error('[OfflineStorage] Error storing inspection:', error)
      throw error
    }
  }

  /**
   * Obtiene todas las inspecciones almacenadas offline
   */
  async getOfflineInspections() {
    const db = await this.openDB()
    const tx = db.transaction(['inspections'], 'readonly')
    
    try {
      const inspections = await this.promisifyRequest(
        tx.objectStore('inspections').getAll()
      )
      
      console.log(`[OfflineStorage] Retrieved ${inspections.length} offline inspections`)
      return inspections
    } catch (error) {
      console.error('[OfflineStorage] Error getting offline inspections:', error)
      throw error
    }
  }

  /**
   * Obtiene una inspección específica por ID
   */
  async getInspection(inspectionId) {
    const db = await this.openDB()
    const tx = db.transaction(['inspections'], 'readonly')
    
    try {
      const inspection = await this.promisifyRequest(
        tx.objectStore('inspections').get(inspectionId)
      )
      
      return inspection
    } catch (error) {
      console.error(`[OfflineStorage] Error getting inspection ${inspectionId}:`, error)
      throw error
    }
  }

  /**
   * Obtiene los form_fills de una inspección
   */
  async getFormFillsByInspection(inspectionId) {
    const db = await this.openDB()
    const tx = db.transaction(['form_fills'], 'readonly')
    
    try {
      const index = tx.objectStore('form_fills').index('inspection_id')
      const formFills = await this.promisifyRequest(index.getAll(inspectionId))
      
      console.log(`[OfflineStorage] Retrieved ${formFills.length} form fills for inspection ${inspectionId}`)
      return formFills
    } catch (error) {
      console.error(`[OfflineStorage] Error getting form fills for inspection ${inspectionId}:`, error)
      throw error
    }
  }

  /**
   * Actualiza los datos de un form_fill
   */
  async updateFormFill(formFillId, data, photos = null) {
    const db = await this.openDB()
    const tx = db.transaction(['form_fills'], 'readwrite')
    
    try {
      const store = tx.objectStore('form_fills')
      const formFill = await this.promisifyRequest(store.get(formFillId))
      
      if (!formFill) {
        throw new Error(`Form fill ${formFillId} not found`)
      }

      // Actualizar datos
      formFill.data = { ...formFill.data, ...data }
      formFill.updated_at = Date.now()
      formFill.has_pending_changes = true

      // Actualizar fotos si se proporcionan
      if (photos) {
        formFill.photos = { ...formFill.photos, ...photos }
      }

      await this.promisifyRequest(store.put(formFill))
      console.log(`[OfflineStorage] Updated form fill ${formFillId}`)
      
      return formFill
    } catch (error) {
      console.error(`[OfflineStorage] Error updating form fill ${formFillId}:`, error)
      throw error
    }
  }

  /**
   * Obtiene todos los form_fills con cambios pendientes
   */
  async getPendingFormFills() {
    const db = await this.openDB()
    const tx = db.transaction(['form_fills'], 'readonly')
    
    try {
      const store = tx.objectStore('form_fills')
      const allFormFills = await this.promisifyRequest(store.getAll())
      
      // Filter form fills that have pending changes
      const pendingFormFills = allFormFills.filter(formFill => 
        formFill.has_pending_changes === true || formFill.has_pending_changes === 'true'
      )
      
      console.log(`[OfflineStorage] Found ${pendingFormFills.length} form fills with pending changes`)
      return pendingFormFills
    } catch (error) {
      console.error('[OfflineStorage] Error getting pending form fills:', error)
      throw error
    }
  }

  /**
   * Marca un form_fill como sincronizado
   */
  async markFormFillAsSynced(formFillId) {
    const db = await this.openDB()
    const tx = db.transaction(['form_fills'], 'readwrite')
    
    try {
      const store = tx.objectStore('form_fills')
      const formFill = await this.promisifyRequest(store.get(formFillId))
      
      if (formFill) {
        formFill.synced_at = Date.now()
        formFill.has_pending_changes = false
        await this.promisifyRequest(store.put(formFill))
        console.log(`[OfflineStorage] Marked form fill ${formFillId} as synced`)
      }
    } catch (error) {
      console.error(`[OfflineStorage] Error marking form fill ${formFillId} as synced:`, error)
      throw error
    }
  }

  /**
   * Agrega un elemento a la cola de sincronización
   */
  async addToSyncQueue(type, inspectionId, formFillId, payload) {
    const db = await this.openDB()
    const tx = db.transaction(['sync_queue'], 'readwrite')
    
    try {
      const syncItem = {
        id: this.generateUUID(),
        type: type, // 'form_fill_update' | 'photo_upload'
        inspection_id: inspectionId,
        form_fill_id: formFillId,
        payload: payload,
        created_at: Date.now(),
        retry_count: 0
      }

      await this.promisifyRequest(
        tx.objectStore('sync_queue').add(syncItem)
      )
      
      console.log(`[OfflineStorage] Added ${type} to sync queue for form fill ${formFillId}`)
      return syncItem.id
    } catch (error) {
      console.error('[OfflineStorage] Error adding to sync queue:', error)
      throw error
    }
  }

  /**
   * Obtiene elementos de la cola de sincronización
   */
  async getSyncQueue() {
    const db = await this.openDB()
    const tx = db.transaction(['sync_queue'], 'readonly')
    
    try {
      const queueItems = await this.promisifyRequest(
        tx.objectStore('sync_queue').getAll()
      )
      
      console.log(`[OfflineStorage] Retrieved ${queueItems.length} items from sync queue`)
      return queueItems
    } catch (error) {
      console.error('[OfflineStorage] Error getting sync queue:', error)
      throw error
    }
  }

  /**
   * Elimina un elemento de la cola de sincronización
   */
  async removeFromSyncQueue(syncItemId) {
    const db = await this.openDB()
    const tx = db.transaction(['sync_queue'], 'readwrite')
    
    try {
      await this.promisifyRequest(
        tx.objectStore('sync_queue').delete(syncItemId)
      )
      
      console.log(`[OfflineStorage] Removed item ${syncItemId} from sync queue`)
    } catch (error) {
      console.error(`[OfflineStorage] Error removing item ${syncItemId} from sync queue:`, error)
      throw error
    }
  }

  /**
   * Actualiza un elemento de la cola de sincronización
   */
  async updateSyncItem(syncItemId, updates) {
    const db = await this.openDB()
    const tx = db.transaction(['sync_queue'], 'readwrite')
    
    try {
      const store = tx.objectStore('sync_queue')
      const item = await this.promisifyRequest(store.get(syncItemId))
      
      if (item) {
        Object.assign(item, updates)
        await this.promisifyRequest(store.put(item))
        console.log(`[OfflineStorage] Updated sync item ${syncItemId}`)
      }
    } catch (error) {
      console.error(`[OfflineStorage] Error updating sync item ${syncItemId}:`, error)
      throw error
    }
  }

  /**
   * Almacena datos de form_fill para uso offline
   */
  async saveFormFillData(formFillId, changedData) {
    if (!formFillId || Object.keys(changedData).length === 0) {
      console.log('[OfflineStorage] No formFillId or changedData provided. Skipping save.');
      return;
    }

    try {
      const db = await this.openDB();
      const tx = db.transaction("form_fills", "readwrite");
      const store = tx.objectStore("form_fills");

      const numericFormFillId = parseInt(formFillId, 10);
      const formFill = await this.promisifyRequest(store.get(numericFormFillId));

      if (formFill) {
        const updatedData = { ...(formFill.data || {}), ...changedData };
        formFill.data = updatedData;
        formFill.has_pending_changes = true;
        formFill.updated_at = Date.now();

        await this.promisifyRequest(store.put(formFill));
        console.log(
          `[OfflineStorage] FormFill ID ${formFillId} updated in IndexedDB with:`,
          changedData
        );
      } else {
        console.error(
          `[OfflineStorage] No se encontró FormFill con ID ${formFillId} en IndexedDB.`
        );
      }

      await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = (event) => {
          console.error('[OfflineStorage] Transaction error on saveFormFillData:', event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      console.error("[OfflineStorage] Error al guardar en IndexedDB:", error);
    }
  }



  /**
   * Obtiene datos de form_fill almacenados offline
   */
  async getFormFillData(formFillId) {
    const db = await this.openDB()
    const tx = db.transaction(['form_fills'], 'readonly')
    
    try {
      const store = tx.objectStore('form_fills')
      const result = await this.promisifyRequest(store.get(formFillId))
      
      if (result) {
        console.log(`[OfflineStorage] Retrieved form fill data for ${formFillId}`)
      }
      
      return result
    } catch (error) {
      console.error(`[OfflineStorage] Error retrieving form fill data:`, error)
      throw error
    }
  }

  /**
   * Elimina datos de form_fill del almacenamiento offline
   */
  async removeFormFillData(formFillId) {
    const db = await this.openDB()
    const tx = db.transaction(['form_fills'], 'readwrite')
    
    try {
      const store = tx.objectStore('form_fills')
      await this.promisifyRequest(store.delete(formFillId))
      console.log(`[OfflineStorage] Removed form fill data for ${formFillId}`)
    } catch (error) {
      console.error(`[OfflineStorage] Error removing form fill data:`, error)
      throw error
    }
  }

  /**
   * Verifica si existen datos de form_fill offline
   */
  async hasFormFillData(formFillId) {
    const db = await this.openDB()
    const tx = db.transaction(['form_fills'], 'readonly')
    
    try {
      const store = tx.objectStore('form_fills')
      const result = await this.promisifyRequest(store.get(formFillId))
      return !!result
    } catch (error) {
      console.error(`[OfflineStorage] Error checking form fill data:`, error)
      return false
    }
  }

  /**
   * Obtiene todos los form_fills almacenados offline
   */
  async getAllFormFillData() {
    const db = await this.openDB()
    const tx = db.transaction(['form_fills'], 'readonly')
    
    try {
      const store = tx.objectStore('form_fills')
      const result = await this.promisifyRequest(store.getAll())
      console.log(`[OfflineStorage] Retrieved ${result.length} form fills`)
      return result
    } catch (error) {
      console.error(`[OfflineStorage] Error retrieving all form fills:`, error)
      throw error
    }
  }

  /**
   * Almacena una foto como blob en IndexedDB
   */
  async storePhotoBlob(photoId, blob, metadata = {}) {
    const db = await this.openDB()
    const tx = db.transaction(['photos'], 'readwrite')
    
    try {
      const store = tx.objectStore('photos')
      const photoData = {
        id: photoId,
        blob: blob,
        metadata: {
          ...metadata,
          stored_at: new Date().toISOString(),
          size: blob.size,
          type: blob.type
        }
      }
      
      await this.promisifyRequest(store.put(photoData))
      console.log(`[OfflineStorage] Stored photo blob ${photoId}`, { size: blob.size, type: blob.type })
    } catch (error) {
      console.error(`[OfflineStorage] Error storing photo blob:`, error)
      throw error
    }
  }

  /**
   * Obtiene una foto almacenada como blob
   */
  async getPhotoBlob(photoId) {
    const db = await this.openDB()
    const tx = db.transaction(['photos'], 'readonly')
    
    try {
      const store = tx.objectStore('photos')
      const result = await this.promisifyRequest(store.get(photoId))
      
      if (result) {
        console.log(`[OfflineStorage] Retrieved photo blob ${photoId}`)
        return result
      }
      
      return null
    } catch (error) {
      console.error(`[OfflineStorage] Error retrieving photo blob:`, error)
      throw error
    }
  }

  /**
   * Elimina una foto del almacenamiento
   */
  async removePhotoBlob(photoId) {
    const db = await this.openDB()
    const tx = db.transaction(['photos'], 'readwrite')
    
    try {
      const store = tx.objectStore('photos')
      await this.promisifyRequest(store.delete(photoId))
      console.log(`[OfflineStorage] Removed photo blob ${photoId}`)
    } catch (error) {
      console.error(`[OfflineStorage] Error removing photo blob:`, error)
      throw error
    }
  }

  /**
   * Verifica si existe una foto almacenada
   */
  async hasPhotoBlob(photoId) {
    const db = await this.openDB()
    const tx = db.transaction(['photos'], 'readonly')
    
    try {
      const store = tx.objectStore('photos')
      const result = await this.promisifyRequest(store.get(photoId))
      return !!result
    } catch (error) {
      console.error(`[OfflineStorage] Error checking photo blob:`, error)
      return false
    }
  }

  /**
   * Obtiene todas las fotos almacenadas
   */
  async getAllPhotoBlobs() {
    const db = await this.openDB()
    const tx = db.transaction(['photos'], 'readonly')
    
    try {
      const store = tx.objectStore('photos')
      const result = await this.promisifyRequest(store.getAll())
      console.log(`[OfflineStorage] Retrieved ${result.length} photo blobs`)
      return result
    } catch (error) {
      console.error(`[OfflineStorage] Error retrieving all photo blobs:`, error)
      throw error
    }
  }

  /**
   * Convierte un archivo a blob y lo almacena
   */
  async storePhotoFromFile(photoId, file, metadata = {}) {
    try {
      // Crear blob desde el archivo
      const blob = new Blob([file], { type: file.type })
      
      // Agregar metadatos del archivo
      const fileMetadata = {
        ...metadata,
        filename: file.name,
        originalSize: file.size,
        lastModified: file.lastModified
      }
      
      await this.storePhotoBlob(photoId, blob, fileMetadata)
      return photoId
    } catch (error) {
      console.error(`[OfflineStorage] Error storing photo from file:`, error)
      throw error
    }
  }

  /**
   * Crea una URL temporal para mostrar una foto almacenada
   */
  async createPhotoURL(photoId) {
    try {
      const photoData = await this.getPhotoBlob(photoId)
      
      if (photoData && photoData.blob) {
        return URL.createObjectURL(photoData.blob)
      }
      
      return null
    } catch (error) {
      console.error(`[OfflineStorage] Error creating photo URL:`, error)
      return null
    }
  }

  /**
   * Obtiene estadísticas de almacenamiento
   */
  async getStorageStats() {
    try {
      const estimate = await navigator.storage.estimate()
      const inspections = await this.getOfflineInspections()
      const pendingFormFills = await this.getPendingFormFills()
      const syncQueue = await this.getSyncQueue()

      return {
        quota: estimate.quota,
        usage: estimate.usage,
        usagePercentage: ((estimate.usage / estimate.quota) * 100).toFixed(2),
        inspectionsCount: inspections.length,
        pendingChangesCount: pendingFormFills.length,
        syncQueueCount: syncQueue.length
      }
    } catch (error) {
      console.error('[OfflineStorage] Error getting storage stats:', error)
      throw error
    }
  }

  // Método para verificar si una inspección está descargada
  async hasInspection(inspectionId) {
    try {
      const db = await this.openDB()
      const transaction = db.transaction(['inspections'], 'readonly')
      const store = transaction.objectStore('inspections')
      const inspection = await this.promisifyRequest(store.get(inspectionId))
      
      console.log(`[OfflineStorage] Checking inspection ${inspectionId}:`, inspection)
      console.log(`[OfflineStorage] Has inspection result:`, !!inspection)
      
      return !!inspection
    } catch (error) {
      console.error(`[OfflineStorage] Error checking inspection ${inspectionId}:`, error)
      return false
    }
  }

  // Método para almacenar form templates
  async storeFormTemplate(template) {
    const db = await this.openDB()
    const transaction = db.transaction(['form_templates'], 'readwrite')
    const store = transaction.objectStore('form_templates')
    
    const templateData = {
      ...template,
      stored_at: new Date().toISOString()
    }
    
    await store.put(templateData)
    console.log('Form template stored:', template.id)
  }

  // Método para remover una inspección y sus datos relacionados
  async removeInspection(inspectionId) {
    const db = await this.openDB()
    
    console.log('[OfflineStorage] Removing inspection:', inspectionId)
    
    // Remover inspección
    const inspectionTransaction = db.transaction(['inspections'], 'readwrite')
    const inspectionStore = inspectionTransaction.objectStore('inspections')
    await this.promisifyRequest(inspectionStore.delete(inspectionId))
    console.log('[OfflineStorage] Inspection removed from inspections store')
    
    // Remover form_fills relacionados
    const formFillTransaction = db.transaction(['form_fills'], 'readwrite')
    const formFillStore = formFillTransaction.objectStore('form_fills')
    const formFillIndex = formFillStore.index('inspection_id')
    
    // Obtener todos los form_fills relacionados con esta inspección
    const formFills = await this.promisifyRequest(formFillIndex.getAll(inspectionId))
    console.log('[OfflineStorage] Found form_fills to remove:', formFills.length)
    
    // Eliminar cada form_fill
    for (const formFill of formFills) {
      console.log('[OfflineStorage] Removing form_fill:', formFill.id)
      await this.promisifyRequest(formFillStore.delete(formFill.id))
    }
    
    console.log('[OfflineStorage] Inspection and related data removed:', inspectionId)
  }

  /**
   * Limpia datos sincronizados antiguos
   */
  async cleanupSyncedData(olderThanDays = 7) {
    const db = await this.openDB()
    const cutoffDate = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000)
    
    try {
      // Limpiar form_fills sincronizados antiguos
      const tx = db.transaction(['form_fills'], 'readwrite')
      const store = tx.objectStore('form_fills')
      const cursor = await this.promisifyRequest(store.openCursor())
      
      let cleanedCount = 0
      
      while (cursor) {
        const formFill = cursor.value
        
        if (!formFill.has_pending_changes && 
            formFill.synced_at && 
            formFill.synced_at < cutoffDate) {
          await this.promisifyRequest(cursor.delete())
          cleanedCount++
        }
        
        cursor = await this.promisifyRequest(cursor.continue())
      }
      
      console.log(`[OfflineStorage] Cleaned up ${cleanedCount} old synced form fills`)
      return cleanedCount
    } catch (error) {
      console.error('[OfflineStorage] Error during cleanup:', error)
      throw error
    }
  }

  /**
   * Utilidades
   */
  promisifyRequest(request) {
    return new Promise((resolve, reject) => {
      if (!request) {
        reject(new Error('Request is null or undefined'))
        return
      }
      
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0
      const v = c == 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  /**
   * Cierra la conexión a la base de datos
   */
  close() {
    if (this.db) {
      this.db.close()
      this.db = null
      console.log('[OfflineStorage] Database connection closed')
    }
  }
}

// Exportar como global para importmap
window.OfflineStorage = OfflineStorage
export default OfflineStorage