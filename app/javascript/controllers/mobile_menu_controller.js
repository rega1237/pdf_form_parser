import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["menu"];

  /**
   * Inicializa el controlador y vincula los manejadores de eventos.
   */
  connect() {
    // Vincular el método al contexto correcto para los event listeners
    this.handleOutsideClick = this.handleOutsideClick.bind(this);
    this.handleResize = this.handleResize.bind(this);
  }

  /**
   * Alterna la visibilidad del menú móvil.
   */
  toggle() {
    const isHidden = this.menuTarget.classList.contains("hidden");

    if (isHidden) {
      this.open();
    } else {
      this.close();
    }
  }

  /**
   * Abre el menú móvil y agrega listeners de eventos para cerrarlo.
   */
  open() {
    this.menuTarget.classList.remove("hidden");
    // Agregar listener para cerrar al hacer clic fuera
    document.addEventListener("click", this.handleOutsideClick);
    window.addEventListener("resize", this.handleResize);
  }

  /**
   * Cierra el menú móvil y elimina los listeners de eventos.
   */
  close() {
    this.menuTarget.classList.add("hidden");
    // Remover listeners
    document.removeEventListener("click", this.handleOutsideClick);
    window.removeEventListener("resize", this.handleResize);
  }

  /**
   * Maneja los clics fuera del menú para cerrarlo.
   * @param {Event} event - El evento de clic.
   */
  handleOutsideClick(event) {
    // Si el clic fue fuera del menú y del botón, cerrar el menú
    if (!this.element.contains(event.target)) {
      this.close();
    }
  }

  /**
   * Maneja los eventos de redimensionamiento de ventana para cerrar el menú en pantallas más grandes.
   */
  handleResize() {
    // Cerrar el menú si la ventana se redimensiona (útil en tablets)
    if (window.innerWidth >= 1024) {
      // lg breakpoint de Tailwind
      this.close();
    }
  }

  /**
   * Limpia los listeners de eventos cuando el controlador se desconecta.
   */
  disconnect() {
    // Limpiar event listeners al desconectar el controlador
    document.removeEventListener("click", this.handleOutsideClick);
    window.removeEventListener("resize", this.handleResize);
  }
}
