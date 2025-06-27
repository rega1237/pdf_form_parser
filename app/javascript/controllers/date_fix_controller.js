import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  connect() {
    // Esperar a que se complete el renderizado
    setTimeout(() => {
      if (!this.element.value || this.element.value === '') {
        const today = new Date()
        const formattedDate = today.toISOString().split('T')[0]
        this.element.value = formattedDate
      }
    }, 100)
  }
}