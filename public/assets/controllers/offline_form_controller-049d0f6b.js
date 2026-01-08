import { Controller } from "@hotwired/stimulus";
import OfflineStorage from "utils/offline_storage";

// Controller para vistas que deben renderizarse 100% desde IndexedDB
// Evita cualquier dependencia de estructuras provenientes del servidor.
export default class extends Controller {
  connect() {
    this.offlineStorage = new OfflineStorage();
    this.initializeFromIndexedDB();
  }

  // Obtiene el ID del form_fill desde el atributo data o desde la URL del form
  getFormFillId() {
    // Preferir Stimulus values si existen
    const datasetId = this.element.dataset.formFillIdValue || this.element.dataset.formFillId;
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

  async initializeFromIndexedDB() {
    try {
      const formFillId = this.getFormFillId();
      if (!formFillId) {
        console.warn("[offline_form_controller] No se pudo determinar el form_fill_id");
        return;
      }

      const formFill = await this.offlineStorage.getFormFillData(formFillId);
      if (!formFill) {
        console.warn(`[offline_form_controller] No se encontró form_fill ${formFillId} en IndexedDB`);
        return;
      }

      // Establecer estructura y datos en el elemento para que otros controladores los consuman
      this.element.dataset.formFillFormStructureValue = JSON.stringify(formFill.form_structure || []);
      this.element.dataset.formFillDataValue = JSON.stringify(formFill.data || {});

      // Si existe un input oculto para la estructura, actualizarlo
      const hiddenInput = document.getElementById("form_fill_form_structure");
      if (hiddenInput) {
        hiddenInput.value = this.element.dataset.formFillFormStructureValue;
      }

      // Disparar un evento para que el form_fill_controller recargue valores
      const evt = new CustomEvent("reload-form-values", { bubbles: true });
      this.element.dispatchEvent(evt);
    } catch (error) {
      console.error("[offline_form_controller] Error inicializando desde IndexedDB:", error);
    }
  }
}
