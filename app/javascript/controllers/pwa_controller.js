import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static values = {
    environment: String,
  };

  static targets = ["status", "syncButton"];

  connect() {
    this.isDevelopment = this.environmentValue === "development";
    this.updateInProgress = false;
    this.isOnline = navigator.onLine;

    this.registerServiceWorker();
    this.setupConnectionHandlers();
    this.createConnectionIndicator();
    this.startConnectionMonitoring();
  }

  disconnect() {
    this.stopConnectionMonitoring();
  }

  async registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      console.log("Service Worker no soportado");
      this.showUnsupportedMessage();
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });

      console.log("Service Worker registrado:", registration.scope);

      // Manejar actualizaciones del SW
      registration.addEventListener("updatefound", () => {
        this.handleUpdateFound(registration.installing);
      });

      // Detectar cuando un nuevo SW toma control
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        this.handleControllerChange();
      });

      // Guardar referencia para uso posterior
      this.swRegistration = registration;
    } catch (error) {
      console.error("Error registrando Service Worker:", error);
      this.showRegistrationError(error);
    }
  }

  setupConnectionHandlers() {
    // Manejar cambios de conectividad
    window.addEventListener("online", () => {
      this.handleOnline();
    });

    window.addEventListener("offline", () => {
      this.handleOffline();
    });

    // Detectar cambios de conectividad más granulares
    this.setupConnectionTesting();
  }

  setupConnectionTesting() {
    // Test de conectividad más robusto que navigator.onLine
    this.connectionTest = setInterval(() => {
      this.testConnection();
    }, 30000); // Test cada 30 segundos
  }

  async testConnection() {
    try {
      // En desarrollo, testear contra un servidor externo
      const testUrl = this.isDevelopment
        ? "https://www.google.com/favicon.ico" // Servidor externo
        : "/manifest.json"; // Servidor local en producción

      const response = await fetch(testUrl, {
        method: "HEAD",
        cache: "no-store",
        mode: this.isDevelopment ? "no-cors" : "same-origin",
        signal: AbortSignal.timeout(5000),
      });

      const wasOffline = !this.isOnline;
      this.isOnline = true; // En modo no-cors, cualquier respuesta significa conectividad

      if (wasOffline && this.isOnline) {
        this.handleOnline();
      }
    } catch (error) {
      const wasOnline = this.isOnline;
      this.isOnline = false;

      if (wasOnline) {
        this.handleOffline();
      }
    }
  }

  handleOnline() {
    console.log("🌐 Conectividad restaurada");
    this.isOnline = true;
    this.updateConnectionIndicator();
    this.enableOnlineFeatures();
    this.triggerConnectionChange();

    // Solo una notificación simple
    this.showNotification("Conectividad restaurada", "success");

    // Notificar al SW que hay conectividad
    this.notifyServiceWorker({ type: "CONNECTION_RESTORED" });
  }

  handleOffline() {
    console.log("📱 Modo offline activado");
    this.isOnline = false;
    this.updateConnectionIndicator();
    this.enableOfflineFeatures();
    this.triggerConnectionChange();

    // Solo una notificación simple
    this.showNotification("Modo offline activado", "info");

    // Notificar al SW del modo offline
    this.notifyServiceWorker({ type: "OFFLINE_MODE" });
  }

  createConnectionIndicator() {
    // Crear indicador de estado de conexión si no existe
    if (!document.getElementById("connection-indicator")) {
      const indicator = document.createElement("div");
      indicator.id = "connection-indicator";
      indicator.className = "connection-indicator";

      indicator.innerHTML = `
        <div class="connection-icon">
          <svg class="connection-online" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
            <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.07 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/>
          </svg>
          <svg class="connection-offline" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
            <path d="M23 9C16.93 2.93 7.07 2.93 1 9l2 2c4.74-4.74 12.26-4.74 17 0l2-2zm-4 4c-3.18-3.18-8.82-3.18-12 0l2 2c1.82-1.82 4.18-1.82 6 0l2-2l2-2zm-6 6l3-3c-1.65-1.66-4.34-1.66-6 0l3 3z"/>
            <path d="M1 1l22 22-1.41 1.41L3.51 6.32 1 9z"/>
          </svg>
        </div>
        <span class="connection-text">Online</span>
      `;

      // Añadir estilos si no existen
      if (!document.getElementById("pwa-connection-styles")) {
        const style = document.createElement("style");
        style.id = "pwa-connection-styles";
        style.textContent = `
          .connection-indicator {
            position: fixed;
            top: 20px;
            left: 20px;
            z-index: 9999;
            background: rgba(16, 185, 129, 0.9);
            color: white;
            padding: 8px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 6px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            transition: all 0.3s ease;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
          }
          
          .connection-indicator.offline {
            background: rgba(239, 68, 68, 0.9);
          }
          
          .connection-indicator.online {
            background: rgba(16, 185, 129, 0.9);
          }
          
          .connection-online, .connection-offline {
            display: none;
          }
          
          .connection-indicator.online .connection-online {
            display: block;
          }
          
          .connection-indicator.offline .connection-offline {
            display: block;
          }
          
          @media (max-width: 768px) {
            .connection-indicator {
              top: 10px;
              left: 10px;
              font-size: 11px;
              padding: 6px 10px;
            }
          }
        `;

        document.head.appendChild(style);
      }

      document.body.appendChild(indicator);
      this.connectionIndicator = indicator;
    } else {
      this.connectionIndicator = document.getElementById(
        "connection-indicator",
      );
    }

    this.updateConnectionIndicator();
  }

  updateConnectionIndicator() {
    if (this.connectionIndicator) {
      const isOnline = this.isOnline;

      this.connectionIndicator.className = `connection-indicator ${isOnline ? "online" : "offline"}`;
      this.connectionIndicator.querySelector(".connection-text").textContent =
        isOnline ? "Online" : "Offline";
    }
  }

  enableOnlineFeatures() {
    // Habilitar elementos que requieren conexión
    document
      .querySelectorAll("[data-requires-connection]")
      .forEach((element) => {
        element.disabled = false;
        element.classList.remove("disabled-offline");
      });

    // Mostrar elementos solo online
    document.querySelectorAll("[data-online-only]").forEach((element) => {
      element.style.display = "block";
    });

    // Ocultar elementos solo offline
    document.querySelectorAll("[data-offline-only]").forEach((element) => {
      element.style.display = "none";
    });

    // Verificar datos pendientes
    this.checkPendingData();
  }

  enableOfflineFeatures() {
    // Deshabilitar elementos que requieren conexión
    document
      .querySelectorAll("[data-requires-connection]")
      .forEach((element) => {
        element.disabled = true;
        element.classList.add("disabled-offline");
      });

    // Ocultar opciones que no funcionan offline
    document.querySelectorAll("[data-online-only]").forEach((element) => {
      element.style.display = "none";
    });

    // Mostrar opciones específicas de offline
    document.querySelectorAll("[data-offline-only]").forEach((element) => {
      element.style.display = "block";
    });
  }

  async checkPendingData() {
    // Verificar si hay datos pendientes de sincronizar
    // Esto se implementará en el Task 3 con IndexedDB
    console.log("Verificando datos pendientes...");
  }

  startConnectionMonitoring() {
    // Inicializar estado
    this.updateConnectionIndicator();

    if (this.isOnline) {
      this.enableOnlineFeatures();
    } else {
      this.enableOfflineFeatures();
    }
  }

  stopConnectionMonitoring() {
    if (this.connectionTest) {
      clearInterval(this.connectionTest);
    }
  }

  handleUpdateFound(newWorker) {
    newWorker.addEventListener("statechange", () => {
      if (
        newWorker.state === "installed" &&
        navigator.serviceWorker.controller &&
        !this.updateInProgress
      ) {
        this.updateInProgress = true;

        if (this.isDevelopment) {
          console.log(
            "Nueva versión del Service Worker disponible (desarrollo)",
          );
          console.log(
            "En desarrollo: actualizaciones silenciadas para evitar molestias",
          );
        } else {
          this.showUpdatePrompt(newWorker);
        }
      }
    });
  }

  showUpdatePrompt(newWorker) {
    const modal = this.createUpdateModal();

    modal.querySelector(".update-now").addEventListener("click", () => {
      newWorker.postMessage({ type: "SKIP_WAITING" });
      modal.remove();
      window.location.reload();
    });

    modal.querySelector(".update-later").addEventListener("click", () => {
      modal.remove();
      this.updateInProgress = false;
    });

    document.body.appendChild(modal);
  }

  createUpdateModal() {
    const modal = document.createElement("div");
    modal.innerHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      ">
        <div style="
          background: white;
          border-radius: 16px;
          padding: 32px;
          max-width: 400px;
          text-align: center;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        ">
          <div style="
            width: 60px;
            height: 60px;
            background: linear-gradient(135deg, #10b981, #059669);
            border-radius: 50%;
            margin: 0 auto 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 24px;
          ">⬆️</div>
          <h3 style="margin: 0 0 16px 0; color: #1f2937; font-size: 20px;">Nueva Versión Disponible</h3>
          <p style="margin: 0 0 24px 0; color: #6b7280; line-height: 1.6;">
            Hay una nueva versión de la aplicación con mejoras y correcciones.
          </p>
          <div style="display: flex; gap: 12px; justify-content: center;">
            <button class="update-now" style="
              background: #10b981;
              color: white;
              border: none;
              padding: 12px 24px;
              border-radius: 8px;
              cursor: pointer;
              font-size: 14px;
              font-weight: 600;
              transition: background 0.3s;
            ">Actualizar Ahora</button>
            <button class="update-later" style="
              background: #f3f4f6;
              color: #6b7280;
              border: none;
              padding: 12px 24px;
              border-radius: 8px;
              cursor: pointer;
              font-size: 14px;
              font-weight: 600;
              transition: background 0.3s;
            ">Más Tarde</button>
          </div>
        </div>
      </div>
    `;
    return modal;
  }

  handleControllerChange() {
    if (this.updateInProgress && !this.isDevelopment) {
      window.location.reload();
    }
  }

  showNotification(message, type = "info") {
    // Crear notificación temporal
    const notification = document.createElement("div");
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    // Estilos para notificación
    const styles = {
      position: "fixed",
      top: "70px",
      right: "20px",
      zIndex: "9999",
      padding: "12px 20px",
      borderRadius: "8px",
      fontSize: "14px",
      fontWeight: "600",
      color: "white",
      transform: "translateX(100%)",
      transition: "transform 0.3s ease",
      boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
    };

    Object.assign(notification.style, styles);

    // Colores según tipo
    const colors = {
      success: "linear-gradient(135deg, #10b981, #059669)",
      error: "linear-gradient(135deg, #ef4444, #dc2626)",
      info: "linear-gradient(135deg, #3b82f6, #2563eb)",
      warning: "linear-gradient(135deg, #f59e0b, #d97706)",
    };

    notification.style.background = colors[type] || colors.info;

    document.body.appendChild(notification);

    // Animar entrada
    setTimeout(() => {
      notification.style.transform = "translateX(0)";
    }, 100);

    // Auto-remove después de 4 segundos
    setTimeout(() => {
      notification.style.transform = "translateX(100%)";
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 4000);
  }

  showUnsupportedMessage() {
    this.showNotification("⚠️ Service Workers no soportados", "warning");
  }

  showRegistrationError(error) {
    console.error("Error de registro SW:", error);
    this.showNotification("❌ Error activando modo offline", "error");
  }

  notifyServiceWorker(message) {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(message);
    }
  }

  // Métodos públicos para usar desde otras partes de la app

  // Precargar URLs importantes en cache
  async preloadUrls(urls) {
    this.notifyServiceWorker({
      type: "CACHE_URLS",
      urls: urls,
    });
  }

  // Limpiar cache completamente
  async clearCache() {
    this.notifyServiceWorker({
      type: "CLEAR_CACHE",
    });
    this.showNotification("🗑️ Cache limpiado", "success");
  }

  // Forzar actualización del SW
  async forceUpdate() {
    if (this.swRegistration) {
      this.swRegistration.update();
    }
  }

  // Verificar si estamos offline
  isOffline() {
    return !this.isOnline;
  }

  // Registrar callback para cambios de conectividad
  onConnectionChange(callback) {
    this.connectionChangeCallbacks = this.connectionChangeCallbacks || [];
    this.connectionChangeCallbacks.push(callback);
  }

  // Disparar callbacks de cambio de conectividad
  triggerConnectionChange() {
    if (this.connectionChangeCallbacks) {
      this.connectionChangeCallbacks.forEach((callback) => {
        try {
          callback(this.isOnline);
        } catch (error) {
          console.error("Error en callback de conectividad:", error);
        }
      });
    }
  }
}
