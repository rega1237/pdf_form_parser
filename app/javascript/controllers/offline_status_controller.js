import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = [
    "status",
    "indicator",
    "syncButton",
    "offlineOnly",
    "onlineOnly",
  ];

  static values = {
    autoHide: { type: Boolean, default: true },
    position: { type: String, default: "top-left" },
  };

  connect() {
    this.isOnline = navigator.onLine;
    this.pendingChanges = 0;

    this.setupEventListeners();
    this.updateStatus();
    this.startPeriodicCheck();

    // Buscar el controlador PWA principal para coordinación
    this.findPWAController();
  }

  disconnect() {
    this.cleanup();
  }

  setupEventListeners() {
    // Eventos de conectividad del navegador
    window.addEventListener("online", this.handleOnline.bind(this));
    window.addEventListener("offline", this.handleOffline.bind(this));

    // Eventos personalizados para coordinación entre controladores
    document.addEventListener(
      "pwa:connection-change",
      this.handleConnectionChange.bind(this),
    );
    document.addEventListener(
      "pwa:pending-changes",
      this.handlePendingChanges.bind(this),
    );
    document.addEventListener(
      "pwa:sync-complete",
      this.handleSyncComplete.bind(this),
    );
  }

  findPWAController() {
    // Buscar el controlador PWA principal para mejor coordinación
    const pwaElement = document.querySelector("[data-controller*='pwa']");
    if (pwaElement) {
      this.pwaController =
        this.application.getControllerForElementAndIdentifier(
          pwaElement,
          "pwa",
        );
    }
  }

  startPeriodicCheck() {
    // Verificación periódica más robusta de conectividad
    this.connectionCheckInterval = setInterval(() => {
      this.performConnectionTest();
    }, 15000); // Cada 15 segundos
  }

  async performConnectionTest() {
    try {
      // Test real de conectividad con timeout corto
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch("/manifest.json", {
        method: "HEAD",
        cache: "no-store",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const wasOffline = !this.isOnline;
      this.isOnline = response.ok && response.status === 200;

      if (wasOffline && this.isOnline) {
        this.handleOnline();
      }
    } catch (error) {
      const wasOnline = this.isOnline;
      this.isOnline = false;

      if (wasOnline && !error.name === "AbortError") {
        this.handleOffline();
      }
    }
  }

  handleOnline() {
    console.log("🌐 Offline Status Controller: Online detectado");
    this.isOnline = true;
    this.updateStatus();
    this.enableOnlineElements();

    // Notificar a otros controladores
    this.dispatch("online", { detail: { timestamp: Date.now() } });
  }

  handleOffline() {
    console.log("📱 Offline Status Controller: Offline detectado");
    this.isOnline = false;
    this.updateStatus();
    this.disableOfflineElements();

    // Notificar a otros controladores
    this.dispatch("offline", { detail: { timestamp: Date.now() } });
  }

  handleConnectionChange(event) {
    // Manejar cambios de conectividad desde otros controladores
    this.isOnline = event.detail.isOnline;
    this.updateStatus();
  }

  handlePendingChanges(event) {
    // Actualizar contador de cambios pendientes
    this.pendingChanges = event.detail.count || 0;
    this.updateSyncButton();
  }

  handleSyncComplete(event) {
    // Resetear cambios pendientes después de sync exitoso
    this.pendingChanges = 0;
    this.updateSyncButton();
    this.showConnectionToast("Sincronización completada", "success");
  }

  updateStatus() {
    // Actualizar indicadores de estado
    this.updateStatusTargets();
    this.updateIndicatorTargets();
    this.updateElementVisibility();
  }

  updateStatusTargets() {
    this.statusTargets.forEach((target) => {
      target.textContent = this.isOnline ? "Online" : "Offline";
      target.className = `status ${this.isOnline ? "online" : "offline"}`;

      // Añadir data attributes para CSS
      target.dataset.connectionStatus = this.isOnline ? "online" : "offline";
    });
  }

  updateIndicatorTargets() {
    this.indicatorTargets.forEach((indicator) => {
      const isOnline = this.isOnline;

      // Actualizar clases CSS
      indicator.classList.remove("online", "offline");
      indicator.classList.add(isOnline ? "online" : "offline");

      // Actualizar contenido si es necesario
      const textElement = indicator.querySelector(".connection-text");
      if (textElement) {
        textElement.textContent = isOnline ? "Online" : "Offline";
      }

      // Actualizar iconos
      const onlineIcon = indicator.querySelector(".connection-online");
      const offlineIcon = indicator.querySelector(".connection-offline");

      if (onlineIcon && offlineIcon) {
        onlineIcon.style.display = isOnline ? "block" : "none";
        offlineIcon.style.display = isOnline ? "none" : "block";
      }
    });
  }

  updateElementVisibility() {
    // Mostrar/ocultar elementos según conectividad
    this.onlineOnlyTargets.forEach((element) => {
      element.style.display = this.isOnline ? "block" : "none";
      element.disabled = !this.isOnline;
    });

    this.offlineOnlyTargets.forEach((element) => {
      element.style.display = this.isOnline ? "none" : "block";
    });
  }

  enableOnlineElements() {
    // Habilitar elementos que requieren conexión
    document
      .querySelectorAll("[data-requires-connection]")
      .forEach((element) => {
        element.disabled = false;
        element.classList.remove("disabled-offline");

        // Remover tooltip de offline si existe
        const tooltip = element.querySelector(".offline-tooltip");
        if (tooltip) {
          tooltip.remove();
        }
      });
  }

  disableOfflineElements() {
    // Deshabilitar elementos que requieren conexión - simple, sin tooltips
    document
      .querySelectorAll("[data-requires-connection]")
      .forEach((element) => {
        element.disabled = true;
        element.classList.add("disabled-offline");
      });
  }

  updateSyncButton() {
    this.syncButtonTargets.forEach((button) => {
      // Actualizar estado del botón de sync
      if (this.pendingChanges > 0) {
        button.classList.add("has-pending");
        button.disabled = !this.isOnline;

        // Actualizar contador si existe
        const counter = button.querySelector(".pending-counter");
        if (counter) {
          counter.textContent = this.pendingChanges;
          counter.style.display = "block";
        } else {
          // Crear contador
          const counterElement = document.createElement("span");
          counterElement.className = "pending-counter";
          counterElement.textContent = this.pendingChanges;
          counterElement.style.cssText = `
            position: absolute;
            top: -8px;
            right: -8px;
            background: #f59e0b;
            color: white;
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 10px;
            min-width: 16px;
            text-align: center;
            font-weight: 600;
          `;
          button.appendChild(counterElement);
        }
      } else {
        button.classList.remove("has-pending");
        const counter = button.querySelector(".pending-counter");
        if (counter) {
          counter.style.display = "none";
        }
      }
    });
  }

  showConnectionToast(message, type = "info") {
    // No mostrar notificaciones - las maneja el PWA controller principal
    return;
  }

  positionToast(toast) {
    const positions = {
      "top-left": { top: "20px", left: "20px", transform: "none" },
      "top-right": { top: "20px", right: "20px", transform: "none" },
      "bottom-left": { bottom: "20px", left: "20px", transform: "none" },
      "bottom-right": { bottom: "20px", right: "20px", transform: "none" },
      "bottom-center": {
        bottom: "20px",
        left: "50%",
        transform: "translateX(-50%)",
      },
    };

    const position =
      positions[this.positionValue] || positions["bottom-center"];
    Object.assign(toast.style, position);
  }

  // Métodos públicos para uso desde otros controladores

  // Obtener estado actual
  getConnectionStatus() {
    return {
      isOnline: this.isOnline,
      pendingChanges: this.pendingChanges,
      lastCheck: this.lastConnectionCheck,
    };
  }

  // Forzar verificación de conectividad
  async checkConnection() {
    await this.performConnectionTest();
    return this.isOnline;
  }

  // Notificar cambios pendientes desde otros controladores
  setPendingChanges(count) {
    this.pendingChanges = count;
    this.updateSyncButton();

    // Disparar evento personalizado
    this.dispatch("pendingChanges", {
      detail: { count: count, timestamp: Date.now() },
    });
  }

  // Método para cleanup
  cleanup() {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }

    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);
    document.removeEventListener(
      "pwa:connection-change",
      this.handleConnectionChange,
    );
    document.removeEventListener(
      "pwa:pending-changes",
      this.handlePendingChanges,
    );
    document.removeEventListener("pwa:sync-complete", this.handleSyncComplete);
  }
}
