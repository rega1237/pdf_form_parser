import { Controller } from "@hotwired/stimulus";
import OfflineStorage from "utils/offline_storage";

/**
 * Controller for views that must be rendered 100% from IndexedDB.
 * Avoids any dependency on structures coming from the server.
 */
export default class extends Controller {
  /**
   * Initializes the controller and the offline storage instance.
   */
  connect() {
    this.offlineStorage = new OfflineStorage();
    this.initializeFromIndexedDB();
  }

  /**
   * Retrieves the form fill ID from data attributes or the form action URL.
   * @returns {number|null} The form fill ID or null if not found.
   */
  getFormFillId() {
    // Preferir Stimulus values si existen
    const datasetId =
      this.element.dataset.formFillIdValue || this.element.dataset.formFillId;
    if (datasetId) return parseInt(datasetId, 10);

    // Fallback: extraer del action del formulario
    if (this.element.action) {
      try {
        const idStr = this.element.action.split("/").pop().split("?")[0];
        return parseInt(idStr, 10);
      } catch (_) {}
    }
    return null;
  }

  /**
   * Inicializa los datos del formulario desde IndexedDB.
   * Obtiene la estructura y los datos del formulario, actualiza los elementos del DOM y dispara un evento de recarga.
   */
  async initializeFromIndexedDB() {
    try {
      const formFillId = this.getFormFillId();
      if (!formFillId) {
        console.warn(
          "[offline_form_controller] No se pudo determinar el form_fill_id",
        );
        return;
      }

      const formFill = await this.offlineStorage.getFormFillData(formFillId);
      if (!formFill) {
        console.warn(
          `[offline_form_controller] No se encontró form_fill ${formFillId} en IndexedDB`,
        );
        return;
      }

      // Establecer estructura y datos en el elemento para que otros controladores los consuman
      this.element.dataset.formFillFormStructureValue = JSON.stringify(
        formFill.form_structure || [],
      );
      this.element.dataset.formFillDataValue = JSON.stringify(
        formFill.data || {},
      );

      // Si existe un input oculto para la estructura, actualizarlo
      const hiddenInput = document.getElementById("form_fill_form_structure");
      if (hiddenInput) {
        hiddenInput.value = this.element.dataset.formFillFormStructureValue;
      }

      // Disparar un evento para que el form_fill_controller recargue valores
      const evt = new CustomEvent("reload-form-values", { bubbles: true });
      this.element.dispatchEvent(evt);
    } catch (error) {
      console.error(
        "[offline_form_controller] Error inicializando desde IndexedDB:",
        error,
      );
    }
  }
}
