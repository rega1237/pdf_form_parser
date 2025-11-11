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

    // Prepara las funciones enlazadas para eventos globales.
    this.boundHide = this.hide.bind(this)
    this.boundReposition = this.reposition.bind(this)
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
    this.reposition() // Posiciona correctamente el dropdown
    this.searchInputTarget.focus() // Pone el foco en el campo de búsqueda.
    // Escucha clics fuera del componente para cerrarlo.
    document.addEventListener('click', this.boundHide, true)
    // Ajusta posicionamiento en cambios de viewport.
    window.addEventListener('resize', this.boundReposition)
    window.addEventListener('scroll', this.boundReposition, true)
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
    window.removeEventListener('resize', this.boundReposition)
    window.removeEventListener('scroll', this.boundReposition, true)
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

  // Posiciona el dropdown para que se superponga y no desborde la pantalla.
  reposition() {
    const container = this.optionsContainerTarget
    const button = this.buttonTarget
    const rect = button.getBoundingClientRect()

    // Asegura estilo base para overlay
    container.style.position = 'absolute'
    container.style.left = '0'
    container.style.right = '0'
    container.style.width = '100%'
    container.style.zIndex = '1000'

    // Determina si hay espacio suficiente abajo; si no, abre hacia arriba.
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight
    const estimatedHeight = Math.min(container.scrollHeight || 256, 256) // estimación prudente
    const spaceBelow = viewportHeight - rect.bottom

    if (spaceBelow < estimatedHeight && rect.top > estimatedHeight) {
      // Abrir hacia arriba
      container.style.top = 'auto'
      container.style.bottom = `${button.offsetHeight}px`
    } else {
      // Abrir hacia abajo (debajo del botón)
      container.style.bottom = 'auto'
      container.style.top = `${button.offsetHeight}px`
    }

    // Limitar altura para evitar que tape toda la pantalla y permitir scroll interno
    container.style.maxHeight = '16rem' // ~256px
    container.style.overflow = 'auto'
  }
}