import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  connect() {
    this.timeoutId = setTimeout(() => {
      this.hide()
    }, 3000)
  }

  disconnect() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
    }
  }

  hide() {
    this.element.style.opacity = '0'
    setTimeout(() => {
      this.element.remove()
    }, 500)
  }

  close() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
    }
    this.hide()
  }
}