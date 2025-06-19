import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = [ "button", "hiddenInput" ]

  connect() {
    this.hiddenInput = document.getElementById(this.element.dataset.hiddenInputId)
    this.buttons = this.element.querySelectorAll('.choice-button')
    this.preselectButton()
  }

  preselectButton() {
    if (this.hiddenInput && this.hiddenInput.value) {
      this.buttons.forEach(button => {
        if (button.dataset.value === this.hiddenInput.value) {
          button.classList.add('selected')
        }
      })
    }
  }

  select(event) {
    event.preventDefault()
    const selectedButton = event.currentTarget
    const currentValue = selectedButton.dataset.value

    if (selectedButton.classList.contains('selected')) {
      selectedButton.classList.remove('selected')
      if (this.hiddenInput) {
        this.hiddenInput.value = ''
      }
    } else {
      this.buttons.forEach(btn => btn.classList.remove('selected'))
      selectedButton.classList.add('selected')
      if (this.hiddenInput) {
        this.hiddenInput.value = currentValue
      }
    }
  }
}