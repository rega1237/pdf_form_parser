import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static values = {
    status: String,
    refreshInterval: { type: Number, default: 3000 }, // 3 segundos por defecto
  };

  connect() {
    if (this.statusValue === "generating") {
      this.startPolling();
    }
  }

  disconnect() {
    this.stopPolling();
  }

  startPolling() {
    this.pollTimer = setInterval(() => {
      this.checkStatus();
    }, this.refreshIntervalValue);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

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

  statusValueChanged() {
    if (this.statusValue === "generating") {
      this.startPolling();
    } else {
      this.stopPolling();
    }
  }
}
