import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static values = {
    status: String,
    refreshInterval: { type: Number, default: 3000 }, // 3 segundos por defecto
  };

  /**
   * Inicializa el controlador. Si el estado es 'generating', inicia el sondeo.
   */
  connect() {
    if (this.statusValue === "generating") {
      this.startPolling();
    }
  }

  /**
   * Limpia el temporizador de sondeo al desconectar.
   */
  disconnect() {
    this.stopPolling();
  }

  /**
   * Inicia el sondeo periódico para verificar el estado.
   */
  startPolling() {
    this.pollTimer = setInterval(() => {
      this.checkStatus();
    }, this.refreshIntervalValue);
  }

  /**
   * Detiene el sondeo.
   */
  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Verifica el estado actual recargando la página.
   */
  async checkStatus() {
    try {
      // Recargar la página para verificar el estado actualizado
      window.location.reload();
    } catch (error) {
      console.error("Error checking PDF status:", error);
      // Si hay error, detener el polling
      this.stopPolling();
    }
  }

  /**
   * Callback de Stimulus cuando cambia el valor de status.
   */
  statusValueChanged() {
    if (this.statusValue === "generating") {
      this.startPolling();
    } else {
      this.stopPolling();
    }
  }
}
