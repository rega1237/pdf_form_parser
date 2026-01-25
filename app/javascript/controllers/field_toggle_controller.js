import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  connect() {
    // Vinculamos la función al contexto correcto para poder usar 'this' dentro de ella.
    this.handlePageChange = this.handlePageChange.bind(this);
    
    // Escuchamos el evento 'pageChanged' que dispara el controlador de paginación.
    this.element.addEventListener("pageChanged", this.handlePageChange);

    // Hacemos una configuración inicial para la primera página que se carga.
    this.handlePageChange();
  }

  disconnect() {
    // Es buena práctica limpiar los event listeners cuando el controlador se desconecta.
    this.element.removeEventListener("pageChanged", this.handlePageChange);
  }

  /**
   * Esta función se ejecuta cada vez que cambia la página.
   * Su trabajo es encontrar los elementos relevantes (botón, campos, etc.)
   * DENTRO de la página que está visible actualmente.
   */
  handlePageChange() {
    // Buscamos cuál es la página activa en este momento.
    const currentPage = this.element.querySelector('.page-content:not(.hidden)');
    if (!currentPage) return;

    // Encontramos los elementos específicos de ESTA página y los guardamos.
    this.toggleButton = currentPage.querySelector('[data-field-toggle-target="toggleButton"]');
    this.toggleIcon = currentPage.querySelector('[data-field-toggle-target="toggleIcon"]');
    this.toggleText = currentPage.querySelector('[data-field-toggle-target="toggleText"]');
    this.additionalFields = currentPage.querySelector('[data-field-toggle-target="additionalFields"]');
    
    // Reseteamos el estado a "no expandido" cada vez que cambiamos de página.
    this.isExpanded = false;
  }

  toggleFields() {
    // Verificamos que los elementos existan en la página actual.
    if (!this.toggleButton || !this.additionalFields) {
      console.error("Toggle elements not found on the current page.");
      return;
    }

    this.isExpanded = !this.isExpanded;
    
    // Aplicamos las clases para mostrar u ocultar los campos y animar el icono.
    this.additionalFields.classList.toggle('show', this.isExpanded);
    this.toggleIcon.classList.toggle('rotated', this.isExpanded);
    this.toggleButton.classList.toggle('expanded', this.isExpanded);

    // Actualizamos el texto del botón.
    const text = this.toggleText.textContent;
    if (this.isExpanded) {
      this.toggleText.textContent = text.replace('Show', 'Hide');
    } else {
      this.toggleText.textContent = text.replace('Hide', 'Show');
    }
  }
}