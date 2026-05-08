import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static values = {
    status: String,
    refreshInterval: { type: Number, default: 3000 }, // 3 segundos por defecto
  };

  /**
   * Inicializa el controlador. Si el estado es 'generating', inicia el sondeo.
   * Cuenta los reloads en sessionStorage para evitar bucles infinitos en producción.
   */
  connect() {
    if (this.statusValue === "generating") {
      const pathKey = `pdf_reload_count_${window.location.pathname}`;
      const count = parseInt(sessionStorage.getItem(pathKey) || "0", 10);

      if (count >= 10) { // Máximo 10 intentos (aprox. 30-50 segundos)
        console.warn("La generación del PDF está tardando más de lo esperado. Se detuvo el refresco automático para evitar un bucle.");
        sessionStorage.removeItem(pathKey); // Permitir reintento si el usuario refresca manualmente
        this.stopPolling();
        return;
      }

      this.startPolling();
    } else {
      // Limpiar el contador si el estado ya es completado o fallido
      sessionStorage.removeItem(`pdf_reload_count_${window.location.pathname}`);
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
      const pathKey = `pdf_reload_count_${window.location.pathname}`;
      const count = parseInt(sessionStorage.getItem(pathKey) || "0", 10);
      sessionStorage.setItem(pathKey, (count + 1).toString());

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
      sessionStorage.removeItem(`pdf_reload_count_${window.location.pathname}`);
      this.stopPolling();
    }
  }
}
