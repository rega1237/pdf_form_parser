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
    this.version = 2
    this.db = null
  }

  /**
   * Normaliza diferentes formatos de form_structure para que sea siempre un arreglo.
   * Acepta:
   * - String JSON (por ejemplo, "[{...}, {...}]") -> parsea y retorna arreglo
   * - Array -> retorna tal cual
   * - Objeto con propiedades contenedoras (fields | form_fields | structure) -> extrae arreglo
   * - Otro/indefinido -> retorna null
   */
  normalizeFormStructure(fs) {
    try {
      if (!fs) return null
      if (typeof fs === 'string') {
        try {
          const parsed = JSON.parse(fs)
          return Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.fields) ? parsed.fields : (Array.isArray(parsed?.form_fields) ? parsed.form_fields : (Array.isArray(parsed?.structure) ? parsed.structure : null)))
        } catch (e) {
          console.warn('[OfflineStorage] Failed to parse string form_structure:', e)
          return null
        }
      }
      if (Array.isArray(fs)) return fs
      if (typeof fs === 'object') {
        if (Array.isArray(fs.fields)) return fs.fields
        if (Array.isArray(fs.form_fields)) return fs.form_fields
        if (Array.isArray(fs.structure)) return fs.structure
      }
      return null
    } catch (e) {
      console.warn('[OfflineStorage] normalizeFormStructure error:', e)
      return null
    }
  }

  /**
   * Almacena un form_fill individual
   */
  async storeFormFill(formFill) {
    const db = await this.openDB()
    const tx = db.transaction(['form_fills'], 'readwrite')
    
    try {
      const normalizedStructure = this.normalizeFormStructure(formFill.form_structure)
      const formFillToStore = {
        ...formFill,
        form_structure: normalizedStructure,
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
          // New indexes for robust querying
          photosStore.createIndex('metadata.inspection_id', 'metadata.inspection_id', { unique: false })
          photosStore.createIndex('metadata.form_fill_id', 'metadata.form_fill_id', { unique: false })
          photosStore.createIndex('metadata.field_name', 'metadata.field_name', { unique: false })
          photosStore.createIndex('metadata.synced', 'metadata.synced', { unique: false })
          photosStore.createIndex('metadata.is_thumbnail', 'metadata.is_thumbnail', { unique: false })
          photosStore.createIndex('metadata.photo_attachment_id', 'metadata.photo_attachment_id', { unique: false })
          console.log('[OfflineStorage] Created photos object store')
        } else {
          // Ensure new indexes exist when upgrading from older versions
          try {
            const tx = event.target.transaction
            const photosStore = tx.objectStore('photos')
            const indexNames = Array.from(photosStore.indexNames || [])
            const ensureIndex = (name, keyPath) => {
              if (!indexNames.includes(name)) {
                photosStore.createIndex(name, keyPath, { unique: false })
                console.log(`[OfflineStorage] Added index ${name} on photos store`)
              }
            }
            ensureIndex('metadata.inspection_id', 'metadata.inspection_id')
            ensureIndex('metadata.form_fill_id', 'metadata.form_fill_id')
            ensureIndex('metadata.field_name', 'metadata.field_name')
            ensureIndex('metadata.synced', 'metadata.synced')
            ensureIndex('metadata.is_thumbnail', 'metadata.is_thumbnail')
            ensureIndex('metadata.photo_attachment_id', 'metadata.photo_attachment_id')
          } catch (e) {
            console.warn('[OfflineStorage] Failed to ensure photos indexes on upgrade:', e)
          }
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
    
    // Offline-First: sólo necesitamos almacenar inspección y form_fills con la
    // estructura embebida; dejamos de guardar form_templates por separado
    const tx = db.transaction(['inspections', 'form_fills'], 'readwrite')
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

      // Almacenar form_fills (incluyendo la estructura embebida)
      if (inspectionData.form_fills && inspectionData.form_fills.length > 0) {
        console.log(`[OfflineStorage] Storing ${inspectionData.form_fills.length} form fills`)
        const formFillsStore = tx.objectStore('form_fills')
        
        for (let i = 0; i < inspectionData.form_fills.length; i++) {
          const formFill = inspectionData.form_fills[i]
          // Aseguramos que la estructura del formulario esté embebida
          const normalizedStructure = this.normalizeFormStructure(formFill.form_structure || null)
          const formFillToStore = {
            ...formFill,
            form_structure: normalizedStructure,
            photos: formFill.photos || {},
            synced_at: Date.now(),
            has_pending_changes: false
          }

          console.log(`[OfflineStorage] Storing form fill ${i + 1}/${inspectionData.form_fills.length}:`, formFillToStore)
          const formFillResult = await this.promisifyRequest(formFillsStore.put(formFillToStore))
          console.log(`[OfflineStorage] Form fill ${i + 1} stored with result:`, formFillResult)
        }
      }

      // Nota: dejamos de almacenar form_templates por separado; la estructura
      // viene embebida en cada form_fill.

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
      
      console.log(`[OfflineStorage] Stored inspection ${inspectionData.inspection.id} with ${inspectionData.form_fills?.length || 0} form fills`)
      
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
   * Actualiza la estructura (form_structure) de un form_fill en IndexedDB
   * Nota: No se encola automáticamente en la cola de sincronización porque
   * actualmente el backend de sync espera principalmente cambios de `data`.
   * La sincronización de estructura puede hacerse mediante el flujo estándar
   * (guardar borrador) cuando el usuario esté online.
   */
  async saveFormFillStructure(formFillId, newStructure) {
    const db = await this.openDB()
    const tx = db.transaction(['form_fills'], 'readwrite')
    try {
      const store = tx.objectStore('form_fills')
      const numericFormFillId = parseInt(formFillId, 10)
      const formFill = await this.promisifyRequest(store.get(numericFormFillId))

      if (!formFill) {
        throw new Error(`Form fill ${formFillId} not found`)
      }

      formFill.form_structure = this.normalizeFormStructure(newStructure)
      formFill.updated_at = Date.now()
      formFill.has_pending_changes = true

      await this.promisifyRequest(store.put(formFill))
      console.log(`[OfflineStorage] Updated form_structure for form fill ${formFillId}`)

      return formFill
    } catch (error) {
      console.error(`[OfflineStorage] Error updating form_structure for ${formFillId}:`, error)
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

        // Notificar inmediatamente a la UI que el estado de cambios pendientes ha cambiado
        try {
          const evt = new CustomEvent('sync:pending-changes', {
            detail: { formFillId, pending: false },
            bubbles: true
          })
          document.dispatchEvent(evt)
        } catch (e) {
          console.warn('[OfflineStorage] Failed to dispatch pending-changes event (mark synced):', e)
        }
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
  /**
   * Alias: Obtiene todos los elementos de la cola de sincronización
   */
  async getAllSyncItems() {
    return await this.getSyncQueue()
  }
  async removeSyncItem(syncItemId) {
    return await this.removeFromSyncQueue(syncItemId)
  }
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
      const tx = db.transaction(["form_fills", "sync_queue"], "readwrite");
      const formFillsStore = tx.objectStore("form_fills");
      const syncQueueStore = tx.objectStore("sync_queue");

      const numericFormFillId = parseInt(formFillId, 10);
      const formFill = await this.promisifyRequest(formFillsStore.get(numericFormFillId));

      if (formFill) {
        const updatedData = { ...(formFill.data || {}), ...changedData };
        formFill.data = updatedData;
        formFill.has_pending_changes = true;
        formFill.updated_at = Date.now();

        await this.promisifyRequest(formFillsStore.put(formFill));
        console.log(
          `[OfflineStorage] FormFill ID ${formFillId} updated in IndexedDB with:`,
          changedData
        );

        // Agregar a la cola de sincronización SOLO si estamos online.
        // Cuando estamos offline, el flag has_pending_changes será consumido
        // por el proceso de sincronización automático.
        if (navigator.onLine) {
          const syncItem = {
            id: this.generateUUID(),
            type: 'form_fill_update',
            form_fill_id: numericFormFillId,
            payload: {
              form_fill_id: numericFormFillId,
              changes: changedData,
              updated_at: new Date().toISOString()
            },
            created_at: Date.now(),
            retry_count: 0
          };

          await this.promisifyRequest(syncQueueStore.add(syncItem));
          console.log(`[OfflineStorage] Added form_fill_update to sync queue for form fill ${formFillId}`);
        } else {
          console.log('[OfflineStorage] Offline detected. Skipping enqueue; will sync from has_pending_changes later.')
        }

        // Notificar inmediatamente a la UI que existen cambios pendientes (sin necesidad de refrescar)
        try {
          const evt = new CustomEvent('sync:pending-changes', {
            detail: { formFillId: numericFormFillId, pending: true },
            bubbles: true
          })
          document.dispatchEvent(evt)
        } catch (e) {
          console.warn('[OfflineStorage] Failed to dispatch pending-changes event (save data):', e)
        }

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
          // Preserve variant in `metadata.type` (original/thumbnail) and record MIME separately
          mime_type: blob.type
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

  // New: Get photos by inspection_id
  async getPhotosByInspection(inspectionId) {
    const db = await this.openDB()
    const tx = db.transaction(['photos'], 'readonly')
    try {
      const store = tx.objectStore('photos')
      let results = []
      try {
        const index = store.index('metadata.inspection_id')
        results = await this.promisifyRequest(index.getAll(inspectionId))
      } catch (_) {
        // Fallback: filter all
        const all = await this.promisifyRequest(store.getAll())
        results = (all || []).filter(p => String(p?.metadata?.inspection_id) === String(inspectionId))
      }
      return results
    } catch (error) {
      console.error('[OfflineStorage] Error getting photos by inspection:', error)
      return []
    }
  }

  // New: Get photos by form_fill_id
  async getPhotosByFormFill(formFillId) {
    const db = await this.openDB()
    const tx = db.transaction(['photos'], 'readonly')
    try {
      const store = tx.objectStore('photos')
      let results = []
      try {
        const index = store.index('metadata.form_fill_id')
        results = await this.promisifyRequest(index.getAll(formFillId))
      } catch (_) {
        const all = await this.promisifyRequest(store.getAll())
        results = (all || []).filter(p => String(p?.metadata?.form_fill_id) === String(formFillId))
      }
      return results
    } catch (error) {
      console.error('[OfflineStorage] Error getting photos by form_fill:', error)
      return []
    }
  }

  // New: Get latest photo for a specific field in a form_fill
  async getLatestPhotoForField(formFillId, fieldName) {
    try {
      const photos = await this.getPhotosByFormFill(formFillId)
      const candidates = (photos || []).filter(p => String(p?.metadata?.field_name) === String(fieldName))
      if (candidates.length === 0) return null
      candidates.sort((a, b) => new Date(b.metadata?.stored_at || 0) - new Date(a.metadata?.stored_at || 0))
      return candidates[0]
    } catch (error) {
      console.error('[OfflineStorage] Error getting latest photo for field:', error)
      return null
    }
  }

  // New: Remove all photos by inspection_id
  async removePhotosByInspection(inspectionId) {
    const db = await this.openDB()
    const tx = db.transaction(['photos'], 'readwrite')
    try {
      const store = tx.objectStore('photos')
      let toDelete = []
      try {
        const index = store.index('metadata.inspection_id')
        toDelete = await this.promisifyRequest(index.getAll(inspectionId))
      } catch (_) {
        const all = await this.promisifyRequest(store.getAll())
        toDelete = (all || []).filter(p => String(p?.metadata?.inspection_id) === String(inspectionId))
      }
      for (const p of toDelete) {
        await this.promisifyRequest(store.delete(p.id))
      }
      console.log(`[OfflineStorage] Removed ${toDelete.length} photos for inspection ${inspectionId}`)
      return toDelete.length
    } catch (error) {
      console.error('[OfflineStorage] Error removing photos by inspection:', error)
      return 0
    }
  }

  // New: Compute per-inspection storage usage (bytes) for photos
  async getInspectionStorageUsage(inspectionId) {
    try {
      const photos = await this.getPhotosByInspection(inspectionId)
      return (photos || []).reduce((sum, p) => sum + (p?.metadata?.size || p?.blob?.size || 0), 0)
    } catch (error) {
      console.error('[OfflineStorage] Error computing inspection storage usage:', error)
      return 0
    }
  }

  // New: Create a thumbnail blob from an image blob
  async createThumbnailBlob(blob, { maxDimension = 1024, quality = 0.7, outputType = 'image/jpeg' } = {}) {
    try {
      const imageURL = URL.createObjectURL(blob)
      const img = await new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = (e) => reject(e)
        image.src = imageURL
      })

      const { width, height } = img
      const scale = Math.min(1, maxDimension / Math.max(width, height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(imageURL)

      const thumbnailBlob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b)
          else reject(new Error('Failed to create thumbnail blob'))
        }, outputType, quality)
      })
      return thumbnailBlob
    } catch (error) {
      console.error('[OfflineStorage] Error creating thumbnail blob:', error)
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
      const db = await this.openDB();
      const estimate = await navigator.storage.estimate();

      const tx = db.transaction(['inspections', 'form_fills', 'sync_queue'], 'readonly');
      const inspectionsStore = tx.objectStore('inspections');
      const formFillsStore = tx.objectStore('form_fills');
      const syncQueueStore = tx.objectStore('sync_queue');

      const inspectionsCountPromise = this.promisifyRequest(inspectionsStore.count());
      
      // Get all form fills and filter for pending changes (same approach as getPendingFormFills)
      const allFormFillsPromise = this.promisifyRequest(formFillsStore.getAll());

      const syncQueueCountPromise = this.promisifyRequest(syncQueueStore.count());

      const [inspectionsCount, allFormFills, syncQueueCount] = await Promise.all([
        inspectionsCountPromise,
        allFormFillsPromise,
        syncQueueCountPromise
      ]);

      // Filter form fills that have pending changes (handles both boolean true and string 'true')
      const pendingChangesCount = allFormFills.filter(formFill => 
        formFill.has_pending_changes === true || formFill.has_pending_changes === 'true'
      ).length;

      return {
        quota: estimate.quota,
        usage: estimate.usage,
        usagePercentage: ((estimate.usage / estimate.quota) * 100).toFixed(2),
        inspectionsCount: inspectionsCount,
        pendingChangesCount: pendingChangesCount,
        syncQueue: syncQueueCount
      };
    } catch (error) {
      console.error('[OfflineStorage] Error getting storage stats:', error);
      throw error;
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

    // New: Remover fotos relacionadas a la inspección
    try {
      const removedCount = await this.removePhotosByInspection(inspectionId)
      console.log(`[OfflineStorage] Also removed ${removedCount} related photos`)
    } catch (e) {
      console.warn('[OfflineStorage] Failed to remove photos for inspection during cleanup:', e)
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