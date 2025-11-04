import { Controller } from "@hotwired/stimulus";

// Controlador para dibujar firma en canvas, exportar a base64 y PNG,
// y entregar el Blob al controlador offline-photo para almacenamiento offline-first.
// No se agregan credenciales; solo imagen.
export default class extends Controller {
  static targets = ["canvas", "clearButton", "saveButton", "base64Input", "fieldName"];

  async connect() {
    try {
      if (!this.hasCanvasTarget) {
        console.error("[SignaturePad] Canvas target not found in DOM");
        return;
      }

      // Canvas disponible en el DOM
      console.log("Canvas listo");

      // Config desde data attributes o defaults
      this.strokeWidth = Number.parseInt(this.element.dataset.strokeWidth || "2", 10) || 2;
      this.strokeColor = this.element.dataset.strokeColor || "#000000";
      this.padHeight = Number.parseInt(this.element.dataset.padHeight || "200", 10) || 200;

      // Evitar scrolling/gestos por encima del canvas en móviles
      try { this.canvasTarget.style.touchAction = "none"; } catch (_) {}

      // Normalizar tamaño del canvas a dimensiones CSS y DPR
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = this.canvasTarget.clientWidth || this.canvasTarget.parentElement?.clientWidth || 600;
      const cssHeight = this.padHeight;
      this.canvasTarget.width = Math.max(1, Math.floor(cssWidth * dpr));
      this.canvasTarget.height = Math.max(1, Math.floor(cssHeight * dpr));
      this.canvasTarget.style.width = `${cssWidth}px`;
      this.canvasTarget.style.height = `${cssHeight}px`;

      this.ctx = this.canvasTarget.getContext("2d");
      if (!this.ctx) {
        console.error("[SignaturePad] 2D context not available");
        console.error("Error al pintar: ", new Error("Contexto 2D no disponible"));
        return;
      }
      // Escalar para DPR
      if (dpr !== 1) {
        this.ctx.scale(dpr, dpr);
      }

      // Estados internos
      this.isDrawing = false;
      this.isSaving = false;
      this.isConfirmingClear = false;

      this.ctx.lineCap = "round";
      this.ctx.strokeStyle = this.strokeColor;
      this.ctx.lineWidth = this.strokeWidth;
      this.ctx.clearRect(0, 0, cssWidth, cssHeight);

      // Registrar eventos (pointer si disponible; fallback a mouse/touch)
      const supportsPointer = window && "onpointerdown" in window;
      if (supportsPointer) {
        this._boundDown = this.onPointerDown.bind(this);
        this._boundMove = this.onPointerMove.bind(this);
        this._boundUp = this.onPointerUp.bind(this);
        this.canvasTarget.addEventListener("pointerdown", this._boundDown);
        this.canvasTarget.addEventListener("pointermove", this._boundMove);
        document.addEventListener("pointerup", this._boundUp);
      } else {
        this._boundMouseDown = this.onMouseDown.bind(this);
        this._boundMouseMove = this.onMouseMove.bind(this);
        this._boundMouseUp = this.onMouseUp.bind(this);
        this._boundTouchStart = this.onTouchStart.bind(this);
        this._boundTouchMove = this.onTouchMove.bind(this);
        this._boundTouchEnd = this.onTouchEnd.bind(this);
        this.canvasTarget.addEventListener("mousedown", this._boundMouseDown);
        this.canvasTarget.addEventListener("mousemove", this._boundMouseMove);
        document.addEventListener("mouseup", this._boundMouseUp);
        this.canvasTarget.addEventListener("touchstart", this._boundTouchStart, { passive: false });
        this.canvasTarget.addEventListener("touchmove", this._boundTouchMove, { passive: false });
        document.addEventListener("touchend", this._boundTouchEnd);
      }

      // Listener de click para monitoreo
      this._boundClick = this.onCanvasClick.bind(this);
      this.canvasTarget.addEventListener("click", this._boundClick);

      // Reportar estado detallado
      this.reportCanvasStatus("connect");
      this.checkCanvasInteractivity();

      console.log("[SignaturePad] Initialized. size:", { cssWidth, cssHeight, dpr });

      // Intentar precargar firma existente en el canvas sin distorsión
      try {
        await this.preloadExistingSignatureToCanvas();
      } catch (e) {
        console.warn('[SignaturePad] preloadExistingSignatureToCanvas warning:', e);
      }
    } catch (e) {
      console.error("[SignaturePad] Initialization error:", e);
    }
  }

  disconnect() {
    try {
      if (this._boundDown) this.canvasTarget.removeEventListener("pointerdown", this._boundDown);
      if (this._boundMove) this.canvasTarget.removeEventListener("pointermove", this._boundMove);
      if (this._boundUp) document.removeEventListener("pointerup", this._boundUp);
      if (this._boundMouseDown) this.canvasTarget.removeEventListener("mousedown", this._boundMouseDown);
      if (this._boundMouseMove) this.canvasTarget.removeEventListener("mousemove", this._boundMouseMove);
      if (this._boundMouseUp) document.removeEventListener("mouseup", this._boundMouseUp);
      if (this._boundTouchStart) this.canvasTarget.removeEventListener("touchstart", this._boundTouchStart);
      if (this._boundTouchMove) this.canvasTarget.removeEventListener("touchmove", this._boundTouchMove);
      if (this._boundTouchEnd) document.removeEventListener("touchend", this._boundTouchEnd);
      if (this._boundClick) this.canvasTarget.removeEventListener("click", this._boundClick);
    } catch (e) {
      console.warn("[SignaturePad] Disconnect cleanup warning:", e);
    }
  }

  // Pointer handlers
  onPointerDown(event) {
    try {
      this.isDrawing = true;
      this.hasStrokes = true;
      // Al comenzar a dibujar, asegurar que el botón Clear sea visible
      try {
        if (this.hasClearButtonTarget) this.clearButtonTarget.classList.remove('hidden');
      } catch (_) {}
      const { x, y } = this.pointerPos(event);
      this.ctx.beginPath();
      this.ctx.moveTo(x, y);
    } catch (e) { console.warn("[SignaturePad] onPointerDown error:", e); }
  }

  onPointerMove(event) {
    try {
      if (!this.isDrawing) return;
      console.log("Intentando dibujar");
      const { x, y } = this.pointerPos(event);
      console.log("Coordenadas calculadas para pintado:", { x, y });
      this.ctx.strokeStyle = this.strokeColor;
      this.ctx.lineWidth = this.strokeWidth;
      try {
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
      } catch (error) {
        console.error("Error al pintar: ", error);
      }
    } catch (e) { console.error("Error al pintar: ", e); }
  }

  onPointerUp() {
    try {
      if (this.isDrawing) {
        this.isDrawing = false;
        this.ctx.closePath();
      }
    } catch (e) { console.warn("[SignaturePad] onPointerUp error:", e); }
  }

  // Mouse fallback
  onMouseDown(e) { this.onPointerDown(e); }
  onMouseMove(e) { this.onPointerMove(e); }
  onMouseUp() { this.onPointerUp(); }

  // Touch fallback
  onTouchStart(e) {
    try { e.preventDefault(); } catch(_) {}
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    this.isDrawing = true;
    const { x, y } = this.posFromClient(touch.clientX, touch.clientY);
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
  }
  onTouchMove(e) {
    try { e.preventDefault(); } catch(_) {}
    if (!this.isDrawing) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    const { x, y } = this.posFromClient(touch.clientX, touch.clientY);
    console.log("Intentando dibujar");
    console.log("Coordenadas calculadas para pintado (touch):", { x, y });
    try {
      this.ctx.lineTo(x, y);
      this.ctx.stroke();
    } catch (error) {
      console.error("Error al pintar: ", error);
    }
  }
  onTouchEnd() { this.onPointerUp(); }

  // Position helpers
  pointerPos(event) {
    return this.posFromClient(event.clientX, event.clientY);
  }
  posFromClient(clientX, clientY) {
    const rect = this.canvasTarget.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    console.log("Confirmación de cálculo de coordenadas:", { clientX, clientY, rect: { left: rect.left, top: rect.top }, x, y });
    return { x, y };
  }

  // Listener para clicks en canvas (monitoreo)
  onCanvasClick(event) {
    const { x, y } = this.pointerPos(event);
    console.log("Click detectado en canvas");
    console.log("Coordenadas del click:", { x, y });
  }

  async clear(event) {
    try { event?.preventDefault(); } catch(_) {}
    try {
      // Confirmación usando turbo_confirm si está presente, si no, confirm() estándar
      const confirmText = (event?.currentTarget?.dataset?.turboConfirm) || "¿Are you sure you want to delete?";
      this.isConfirmingClear = true;

      const proceed = window.confirm(confirmText);
      if (!proceed) {
        this.isConfirmingClear = false;
        // Asegurar interactividad intacta si el usuario canceló
        try {
          this.canvasTarget.classList.remove('hidden');
          this.canvasTarget.style.pointerEvents = 'auto';
          this.canvasTarget.style.touchAction = 'none';
        } catch(_) {}
        return;
      }

      const cssWidth = this.canvasTarget.clientWidth || parseInt(this.canvasTarget.style.width, 10) || 600;
      const cssHeight = Number.parseInt(this.element.dataset.padHeight || "200", 10) || 200;
      this.ctx.clearRect(0, 0, cssWidth, cssHeight);
      // Asegurar estado de dibujo limpio y canvas visible
      this.isDrawing = false;
      this.hasStrokes = false;
      try { this.canvasTarget.classList.remove('hidden'); } catch (_) {}
      try { if (this.hasClearButtonTarget) this.clearButtonTarget.classList.remove('hidden'); } catch (_) {}
      if (this.hasBase64InputTarget) this.base64InputTarget.value = "";

      // Borrar también la firma almacenada (local y servidor) usando offline-photo
      const offlinePhotoController = this.application.getControllerForElementAndIdentifier(this.element, "offline-photo");
      if (offlinePhotoController && typeof offlinePhotoController.handleRemoveConfirmed === "function") {
        try {
          await offlinePhotoController.handleRemoveConfirmed(event);
        } catch (e) {
          console.warn('[SignaturePad] clear -> offline-photo remove warning:', e);
        }
      }

      // Rehabilitar interacción con el canvas
      this.isConfirmingClear = false;
      try {
        this.canvasTarget.classList.remove('hidden');
        this.canvasTarget.style.pointerEvents = 'auto';
        this.canvasTarget.style.touchAction = 'none';
        // En algunos navegadores, aplicar en el siguiente tick garantiza el estilo
        setTimeout(() => {
          try { this.checkCanvasInteractivity(); } catch(_) {}
        }, 0);
      } catch (_) {}
    } catch (e) { console.warn("[SignaturePad] clear error:", e); }
  }

  async save(event) {
    try { event?.preventDefault(); } catch(_) {}
    try {
      // Bloquear interacción durante guardado
      this.isSaving = true;
      const wasPointerEvents = this.canvasTarget.style.pointerEvents;
      this.canvasTarget.style.pointerEvents = 'none';

      const dataURL = this.canvasTarget.toDataURL("image/png");
      if (this.hasBase64InputTarget) {
        this.base64InputTarget.value = dataURL;
      }

      // Crear Blob; fallback si toBlob no está disponible
      const blob = await new Promise((resolve) => {
        try {
          if (this.canvasTarget.toBlob) {
            this.canvasTarget.toBlob((b) => resolve(b), "image/png");
          } else {
            // Fallback usando dataURL
            const byteString = atob(dataURL.split(",")[1]);
            const mimeString = dataURL.split(",")[0].split(":")[1].split(";")[0];
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
            resolve(new Blob([ab], { type: mimeString }));
          }
        } catch (e) { console.warn("[SignaturePad] toBlob fallback error:", e); resolve(null); }
      });

      const fieldName = this.hasFieldNameTarget ? this.fieldNameTarget.value : this.element.dataset.fieldName;
      const fileName = `signature_${fieldName || "field"}.png`;
      const file = blob ? new File([blob], fileName, { type: "image/png" }) : null;

      const offlinePhotoController = this.application.getControllerForElementAndIdentifier(this.element, "offline-photo");
      if (offlinePhotoController && typeof offlinePhotoController.handleFileSelect === "function" && file) {
        const syntheticEvent = { target: { files: [file] } };
        offlinePhotoController.handleFileSelect(syntheticEvent);
        console.log("[SignaturePad] Signature saved and handed to offline-photo");
        // UX inmediato: ocultar el canvas y mostrar contenedor de preview si existe
        try {
          this.canvasTarget.classList.add('hidden');
          if (this.hasClearButtonTarget) this.clearButtonTarget.classList.add('hidden');
          const containerEl = this.element.querySelector('[id^="signature-preview-"]');
          if (containerEl) {
            containerEl.classList.remove('hidden');
          }
        } catch (_) {}
      } else {
        console.warn("[SignaturePad] offline-photo controller not found or no blob; signature stored as base64 only.");
      }
    } catch (e) {
      console.error("[SignaturePad] save error:", e);
    } finally {
      // Rehabilitar interacción tras guardado
      this.isSaving = false;
      this.canvasTarget.style.pointerEvents = wasPointerEvents || 'auto';
    }
  }

  // Reportar estado del canvas en pasos críticos
  reportCanvasStatus(phase) {
    try {
      const rect = this.canvasTarget.getBoundingClientRect();
      const computed = window.getComputedStyle(this.canvasTarget);
      const dpr = window.devicePixelRatio || 1;
      const status = {
        phase,
        client: { width: this.canvasTarget.clientWidth, height: this.canvasTarget.clientHeight },
        attr: { width: this.canvasTarget.width, height: this.canvasTarget.height },
        style: { width: this.canvasTarget.style.width, height: this.canvasTarget.style.height },
        rect: { width: rect.width, height: rect.height, left: rect.left, top: rect.top },
        computed: {
          display: computed.display,
          visibility: computed.visibility,
          opacity: computed.opacity,
          pointerEvents: computed.pointerEvents,
          touchAction: computed.touchAction || this.canvasTarget.style.touchAction,
        },
        dpr,
        ctxReady: !!this.ctx,
        lineWidth: this.strokeWidth,
        strokeColor: this.strokeColor,
      };
      console.log("[SignaturePad] Estado del canvas:", status);
    } catch (e) {
      console.warn("[SignaturePad] reportCanvasStatus warning:", e);
    }
  }

  // Verificar que estilos CSS no bloqueen la interactividad
  checkCanvasInteractivity() {
    try {
      const computed = window.getComputedStyle(this.canvasTarget);
      if (computed.pointerEvents === "none") {
        console.warn("[SignaturePad] Advertencia: pointer-events:none podría bloquear interacción con el canvas.");
      }
      if (computed.display === "none" || computed.visibility === "hidden") {
        console.warn("[SignaturePad] Advertencia: el canvas está oculto (display:none o visibility:hidden).");
      }
      if ((computed.touchAction || this.canvasTarget.style.touchAction) !== "none") {
        console.warn("[SignaturePad] Advertencia: touch-action no es 'none'; puede interferir con gestos táctiles.");
      }
    } catch (e) {
      console.warn("[SignaturePad] checkCanvasInteractivity warning:", e);
    }
  }

  // Precargar firma existente en el canvas
  async preloadExistingSignatureToCanvas() {
    try {
      const fieldName = this.hasFieldNameTarget ? this.fieldNameTarget.value : this.element.dataset.fieldName;
      if (!fieldName) return;

      // Obtener formFillId del contenedor con offline-photo
      const formFillId = this.element?.dataset?.offlinePhotoFormFillIdValue;
      // Leer attachment_id de data column
      const form = this.element.closest('form');
      const dataJson = form?.dataset?.formFillDataValue || this.element?.dataset?.formFillDataValue;
      if (!dataJson) return;
      const data = JSON.parse(dataJson);
      const attachmentId = data?.[`${fieldName}_signature_attachment_id`];
      if (!attachmentId) return;

      // Pedir URL de firma al servidor usando el controlador offline-photo
      const offlinePhotoController = this.application.getControllerForElementAndIdentifier(this.element, 'offline-photo');
      let url = null;
      if (offlinePhotoController && typeof offlinePhotoController.fetchServerPhotoUrl === 'function') {
        url = await offlinePhotoController.fetchServerPhotoUrl(formFillId, fieldName, attachmentId);
      }
      if (!url) return;

      // Cargar imagen y dibujarla contenida en el canvas
      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = (e) => reject(e);
        image.src = url;
      });

      const cssWidth = this.canvasTarget.clientWidth || parseInt(this.canvasTarget.style.width, 10) || 600;
      const cssHeight = Number.parseInt(this.element.dataset.padHeight || '200', 10) || 200;

      // Limpiar y dibujar con "contain" manteniendo aspecto
      this.ctx.clearRect(0, 0, cssWidth, cssHeight);
      const imgAspect = img.width / img.height;
      const canvasAspect = cssWidth / cssHeight;
      let drawWidth, drawHeight;
      if (imgAspect > canvasAspect) {
        // Imagen más ancha: ajustar a ancho del canvas
        drawWidth = cssWidth;
        drawHeight = Math.round(drawWidth / imgAspect);
      } else {
        // Imagen más alta: ajustar a alto del canvas
        drawHeight = cssHeight;
        drawWidth = Math.round(drawHeight * imgAspect);
      }
      const dx = Math.round((cssWidth - drawWidth) / 2);
      const dy = Math.round((cssHeight - drawHeight) / 2);
      this.ctx.drawImage(img, dx, dy, drawWidth, drawHeight);
    } catch (e) {
      console.warn('[SignaturePad] Could not preload signature:', e);
    }
  }

  // Sin autoguardado: la firma sólo se guarda al presionar el botón "Save".
}