import { Controller } from "@hotwired/stimulus";
import flatpickr from "flatpickr";

export default class extends Controller {
  // Initializes Flatpickr on the element unless it is disabled
  connect() {
    if (this.element.dataset.disabled) {
      return;
    }

    flatpickr(this.element, {
      dateFormat: "m/d/y",
    });
  }
}
