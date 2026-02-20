import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["input", "checkbox"];

  fillDate(event) {
    if (this.checkboxTarget.checked) {
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0'); // January is 0!
      const yy = String(today.getFullYear()).slice(-2);
      
      const formattedDate = `${mm}/${dd}/${yy}`;
      this.inputTarget.value = formattedDate;
      
      // Trigger input and change events to ensure any other listeners (like auto-save) are notified
      this.inputTarget.dispatchEvent(new Event('input', { bubbles: true }));
      this.inputTarget.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // Clear date if unchecked? The user request implies marking it as corrected.
      // Usually, if they uncheck it, they might want to clear the date.
      this.inputTarget.value = "";
      this.inputTarget.dispatchEvent(new Event('input', { bubbles: true }));
      this.inputTarget.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}
