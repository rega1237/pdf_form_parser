import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  // Initializes the controller and sets up the auto-hide timeout
  connect() {
    this.timeoutId = setTimeout(() => {
      this.hide();
    }, 3000);
  }

  // Cleans up the timeout when the controller is disconnected
  disconnect() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }

  // Hides the flash message with a fade-out animation and removes it from the DOM
  hide() {
    this.element.style.opacity = "0";
    setTimeout(() => {
      this.element.remove();
    }, 500);
  }

  // Manually closes the flash message, clearing any pending timeout
  close() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    this.hide();
  }
}
