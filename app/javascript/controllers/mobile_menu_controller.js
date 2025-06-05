import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["menu"];

  connect() {
    // Vincular el método al contexto correcto para los event listeners
    this.handleOutsideClick = this.handleOutsideClick.bind(this);
    this.handleResize = this.handleResize.bind(this);
  }

  toggle() {
    const isHidden = this.menuTarget.classList.contains("hidden");

    if (isHidden) {
      this.open();
    } else {
      this.close();
    }
  }

  open() {
    this.menuTarget.classList.remove("hidden");
    // Agregar listener para cerrar al hacer clic fuera
    document.addEventListener("click", this.handleOutsideClick);
    window.addEventListener("resize", this.handleResize);
  }

  close() {
    this.menuTarget.classList.add("hidden");
    // Remover listeners
    document.removeEventListener("click", this.handleOutsideClick);
    window.removeEventListener("resize", this.handleResize);
  }

  handleOutsideClick(event) {
    // Si el clic fue fuera del menú y del botón, cerrar el menú
    if (!this.element.contains(event.target)) {
      this.close();
    }
  }

  handleResize() {
    // Cerrar el menú si la ventana se redimensiona (útil en tablets)
    if (window.innerWidth >= 1024) {
      // lg breakpoint de Tailwind
      this.close();
    }
  }

  disconnect() {
    // Limpiar event listeners al desconectar el controlador
    document.removeEventListener("click", this.handleOutsideClick);
    window.removeEventListener("resize", this.handleResize);
  }
}
