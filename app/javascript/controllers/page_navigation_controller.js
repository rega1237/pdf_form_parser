import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static outlets = [ "pagination" ]

  jump(event) {
    const pageIndex = parseInt(event.target.value, 10);
    
    if (isNaN(pageIndex)) return;

    if (this.hasPaginationOutlet) {
      this.paginationOutlet.jumpToPage(pageIndex);
    } else {
      console.error("[PageNavigation] ❌ ERROR: No se pudo encontrar el outlet de paginación.");
    }
  }
}