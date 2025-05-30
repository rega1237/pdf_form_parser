import { Controller } from "@hotwired/stimulus";
import Sortable from "sortablejs";

export default class extends Controller {
  static targets = ["list", "item", "input"];

  disconnect() {
    this.sortable.destroy();
  }

  onEnd(event) {
    this.updateOrder();
  }

  updateOrder() {
    const newOrder = this.itemTargets.map((itemEl, index) => {
      const fieldName = itemEl.dataset.id;
      const labelNameInput = itemEl.querySelector(
        '[data-field-attribute="label_name"]'
      );
      const sectionNameInput = itemEl.querySelector(
        '[data-field-attribute="section_name"]'
      );
      const pageNumberInput = itemEl.querySelector(
        '[data-field-attribute="page_number"]'
      );
      const columnWidthInput = itemEl.querySelector(
        '[data-field-attribute="column_width"]'
      );
      const requiredInput = itemEl.querySelector(
        '[data-field-attribute="required"]'
      );

      return {
        id: fieldName, // 'id' here refers to the field's original name/identifier
        position: index,
        label_name: labelNameInput ? labelNameInput.value : "",
        section_name: sectionNameInput ? sectionNameInput.value : "",
        page_number: pageNumberInput ? pageNumberInput.value : "",
        column_width: columnWidthInput ? columnWidthInput.value : "1",
        required: requiredInput ? requiredInput.checked : false,
      };
    });

    if (this.hasInputTarget) {
      this.inputTarget.value = JSON.stringify(newOrder);
    }
    console.log("Updated order with attributes:", newOrder);
  }

  // Ensure updateOrder is called on connect if initial state needs to be captured
  connect() {
    this.sortable = Sortable.create(this.listTarget, {
      animation: 150,
      handle: ".handle",
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      dragClass: "sortable-drag",
      onEnd: this.onEnd.bind(this),
    });
    // Call updateOrder on connect to populate the hidden field initially
    // if there are already items with attributes.
    if (this.itemTargets.length > 0) {
      this.updateOrder();
    }

    // Add event listeners to attribute input fields to update order on change
    this.itemTargets.forEach((itemEl) => {
      const attributeInputs = itemEl.querySelectorAll("[data-field-attribute]");
      attributeInputs.forEach((input) => {
        input.addEventListener("input", () => this.updateOrder());
      });
    });
  }
}
