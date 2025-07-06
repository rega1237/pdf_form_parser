import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = [ "button", "hiddenInput" ]

  connect() {
    this.hiddenInput = document.getElementById(this.element.dataset.hiddenInputId)
    // Buscar tanto botones choice como radio-choice
    this.buttons = this.element.querySelectorAll('.choice-button, .radio-choice-button')
    this.preselectButton()
  }

  preselectButton() {
    if (this.hiddenInput && this.hiddenInput.value) {
      this.buttons.forEach(button => {
        if (button.dataset.value === this.hiddenInput.value) {
          this.selectButton(button, false) // false = no toggle off
        }
      })
    }
  }

  select(event) {
    event.preventDefault()
    const selectedButton = event.currentTarget
    const currentValue = selectedButton.dataset.value
    const isCurrentlySelected = this.isButtonSelected(selectedButton)

    if (isCurrentlySelected) {
      // Deseleccionar solo si es un botón choice regular (no radio)
      if (selectedButton.classList.contains('choice-button')) {
        this.deselectButton(selectedButton)
        if (this.hiddenInput) {
          this.hiddenInput.value = ''
        }
      }
      // Los radio buttons no se pueden deseleccionar haciendo clic en el mismo
    } else {
      // Deseleccionar todos los otros botones del grupo
      this.buttons.forEach(btn => this.deselectButton(btn))
      
      // Seleccionar el botón actual
      this.selectButton(selectedButton, false)
      
      if (this.hiddenInput) {
        this.hiddenInput.value = currentValue
      }
    }
  }

  isButtonSelected(button) {
    if (button.classList.contains('radio-choice-button')) {
      // Para radio buttons, verificar las clases de estilo
      return button.classList.contains('from-blue-600')
    } else {
      // Para choice buttons regulares, usar la clase 'selected'
      return button.classList.contains('selected')
    }
  }

  selectButton(button, canToggleOff = true) {
    if (button.classList.contains('radio-choice-button')) {
      this.selectRadioButton(button)
    } else {
      button.classList.add('selected')
    }
  }

  deselectButton(button) {
    if (button.classList.contains('radio-choice-button')) {
      this.deselectRadioButton(button)
    } else {
      button.classList.remove('selected')
    }
  }

  selectRadioButton(button) {
    // Remover clases de estado no seleccionado
    button.classList.remove(
      'from-slate-100', 'to-slate-200', 'border-slate-400', 'text-slate-900',
      'hover:from-slate-200', 'hover:to-slate-300', 'hover:border-slate-500', 
      'hover:-translate-y-0.5', 'hover:shadow-lg'
    )
    
    // Agregar clases de estado seleccionado
    button.classList.add(
      'from-blue-600', 'to-blue-700', 'border-blue-900', 'text-white', 'shadow-xl'
    )

    // Actualizar el indicador del círculo interno
    const radioIndicator = button.querySelector('.radio-indicator div')
    if (radioIndicator) {
      radioIndicator.classList.remove('opacity-0')
      radioIndicator.classList.add('opacity-100')
    }

    // Actualizar data-selected attribute
    button.dataset.selected = 'true'
  }

  deselectRadioButton(button) {
    // Remover clases de estado seleccionado
    button.classList.remove(
      'from-blue-600', 'to-blue-700', 'border-blue-900', 'text-white', 'shadow-xl'
    )
    
    // Agregar clases de estado no seleccionado
    button.classList.add(
      'from-slate-100', 'to-slate-200', 'border-slate-400', 'text-slate-900',
      'hover:from-slate-200', 'hover:to-slate-300', 'hover:border-slate-500', 
      'hover:-translate-y-0.5', 'hover:shadow-lg'
    )

    // Actualizar el indicador del círculo interno
    const radioIndicator = button.querySelector('.radio-indicator div')
    if (radioIndicator) {
      radioIndicator.classList.remove('opacity-100')
      radioIndicator.classList.add('opacity-0')
    }

    // Actualizar data-selected attribute
    button.dataset.selected = 'false'
  }
}