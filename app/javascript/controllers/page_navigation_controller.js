import { Controller } from "@hotwired/stimulus";

/**
 * Controller to handle page navigation via a pagination outlet.
 * Uses an outlet to communicate with the pagination controller.
 */
export default class extends Controller {
  static outlets = ["pagination"];

  /**
   * Jumps to a specific page index.
   * Expected to be triggered by an input change event (e.g., select or input).
   * @param {Event} event - The change event from the input element.
   */
  jump(event) {
    const pageIndex = parseInt(event.target.value, 10);

    if (isNaN(pageIndex)) return;

    if (this.hasPaginationOutlet) {
      this.paginationOutlet.jumpToPage(pageIndex);
    } else {
      console.error(
        "[PageNavigation] ❌ ERROR: No se pudo encontrar el outlet de paginación.",
      );
    }
  }
}
