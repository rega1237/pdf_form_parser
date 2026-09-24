import { Controller } from "@hotwired/stimulus";

/**
 * Controlador para manejar la indicación de estado offline/online.
 * Actualiza los elementos de la UI basados en el estado de conectividad de la red del navegador.
 */
export default class extends Controller {
  static targets = ["indicator", "text"];

  /**
   * Inicializa el controlador y configura los listeners de eventos para cambios de estado de red.
   */
  connect() {
    // Track last known status to avoid duplicate events
    this.lastIsOnline = null;
    // Bind handlers so we can properly remove them on disconnect
    this.boundOnlineHandler = () => this.updateStatus();
    this.boundOfflineHandler = () => this.updateStatus();
    this.boundTurboLoadHandler = () => this.updateStatus();
    this.boundVisibilityHandler = () => {
      if (document.visibilityState === "visible") {
        this.updateStatus();
      }
    };
    // Initial UI update (do not dispatch app:online on initial load)
    this.updateStatus();
    window.addEventListener("online", this.boundOnlineHandler);
    window.addEventListener("offline", this.boundOfflineHandler);
    document.addEventListener("turbo:load", this.boundTurboLoadHandler);
    document.addEventListener("visibilitychange", this.boundVisibilityHandler);
  }

  /**
   * Limpia los listeners de eventos cuando el controlador se desconecta.
   */
  disconnect() {
    window.removeEventListener("online", this.boundOnlineHandler);
    window.removeEventListener("offline", this.boundOfflineHandler);
    document.removeEventListener("turbo:load", this.boundTurboLoadHandler);
    document.removeEventListener("visibilitychange", this.boundVisibilityHandler);
  }

  /**
   * Actualiza los elementos de la UI (indicador y texto) basado en el estado actual de la red.
   */
  updateStatus() {
    const wasOnline = this.lastIsOnline;
    const isOnline = navigator.onLine;

    if (isOnline) {
      if (this.hasIndicatorTarget) {
        this.indicatorTarget.className =
          "w-2 h-2 rounded-full mr-2 bg-green-500";
      }
      if (this.hasTextTarget) {
        this.textTarget.textContent = "Online";
      }
      // No despachamos eventos aquí; utils/network_status.js ya gestiona las transiciones globales
    } else {
      if (this.hasIndicatorTarget) {
        this.indicatorTarget.className = "w-2 h-2 rounded-full mr-2 bg-red-500";
      }
      if (this.hasTextTarget) {
        this.textTarget.textContent = "Offline";
      }
    }
    this.lastIsOnline = isOnline;
  }
}
