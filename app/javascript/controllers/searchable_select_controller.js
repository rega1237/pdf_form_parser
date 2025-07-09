import { Controller } from "@hotwired/stimulus"

// Controlador para un dropdown con búsqueda.
// Se conecta a un campo de formulario oculto y actualiza su valor.
export default class extends Controller {
  static targets = [ 
    "hiddenInput",    // El input oculto que guarda el valor real.
    "button",         // El botón visible que muestra la selección.
    "buttonText",     // El texto dentro del botón.
    "optionsContainer", // El contenedor del dropdown (con búsqueda y opciones).
    "searchInput",      // El campo de texto para buscar.
    "optionsList"       // La lista <ul> de opciones.
  ]

  connect() {
    // Si el campo oculto ya tiene un valor (ej: al cargar un borrador),
    // lo mostramos en el botón.
    const initialValue = this.hiddenInputTarget.value
    if (initialValue && initialValue.trim() !== '') {
      this.buttonTextTarget.textContent = initialValue
    } else {
      this.buttonTextTarget.textContent = 'Select an option'
    }

    // Prepara la función para cerrar el dropdown al hacer clic fuera.
    this.boundHide = this.hide.bind(this)
  }

  // Muestra u oculta el dropdown.
  toggle() {
    if (this.optionsContainerTarget.classList.contains('hidden')) {
      this.show()
    } else {
      this.hide()
    }
  }

  // Muestra el contenedor de opciones.
  show() {
    this.optionsContainerTarget.classList.remove('hidden')
    this.searchInputTarget.focus() // Pone el foco en el campo de búsqueda.
    // Escucha clics fuera del componente para cerrarlo.
    document.addEventListener('click', this.boundHide, true)
  }

  // Oculta el contenedor de opciones.
  hide(event) {
    // Si el clic fue dentro del propio controlador, no hagas nada.
    if (event && this.element.contains(event.target)) {
      return
    }
    this.optionsContainerTarget.classList.add('hidden')
    // Deja de escuchar clics fuera.
    document.removeEventListener('click', this.boundHide, true)
  }

  // Se ejecuta cuando el usuario selecciona una opción de la lista.
  select(event) {
    const selectedOption = event.currentTarget
    const newValue = selectedOption.dataset.value

    // Actualiza el valor del input oculto y el texto del botón.
    this.hiddenInputTarget.value = newValue
    this.buttonTextTarget.textContent = newValue

    // Dispara un evento 'change' para que otros controladores (como el de validación)
    // sepan que el campo ha cambiado.
    const changeEvent = new Event('change', { bubbles: true })
    this.hiddenInputTarget.dispatchEvent(changeEvent)

    this.hide() // Cierra el dropdown.
  }

  // Filtra la lista de opciones basándose en lo que el usuario escribe.
  search() {
    const query = this.searchInputTarget.value.toLowerCase()
    const allOptions = this.optionsListTarget.querySelectorAll('li')

    allOptions.forEach(option => {
      const text = option.textContent.toLowerCase()
      const matches = text.includes(query)
      option.style.display = matches ? '' : 'none' // Oculta las que no coinciden.
    })
  }
}