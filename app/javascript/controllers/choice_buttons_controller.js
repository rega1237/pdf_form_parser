import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["button", "hiddenInput"];

  connect() {
    this.hiddenInput = document.getElementById(
      this.element.dataset.hiddenInputId,
    );
    // Buscar tanto botones choice como radio-choice
    this.buttons = this.element.querySelectorAll(
      ".choice-button, .radio-choice-button",
    );
    this.preselectButton();
  }

  preselectButton() {
    if (this.hiddenInput && this.hiddenInput.value) {
      this.buttons.forEach((button) => {
        if (button.dataset.value === this.hiddenInput.value) {
          this.selectButton(button, false); // false = no toggle off
        }
      });
    }
  }

  select(event) {
    event.preventDefault();
    const selectedButton = event.currentTarget;
    const currentValue = selectedButton.dataset.value;
    const isCurrentlySelected = this.isButtonSelected(selectedButton);

    // Store old value for change detection
    const oldValue = this.hiddenInput ? this.hiddenInput.value : "";

    if (isCurrentlySelected) {
      // Deseleccionar solo si es un botón choice regular (no radio)
      if (selectedButton.classList.contains("choice-button")) {
        this.deselectButton(selectedButton);
        if (this.hiddenInput) {
          this.hiddenInput.value = "";
        }
      }
      // Los radio buttons no se pueden deseleccionar haciendo clic en el mismo
    } else {
      // Deseleccionar todos los otros botones del grupo
      this.buttons.forEach((btn) => this.deselectButton(btn));

      // Seleccionar el botón actual
      this.selectButton(selectedButton, false);

      if (this.hiddenInput) {
        this.hiddenInput.value = currentValue;
      }
    }

    // Trigger events for form tracking if value actually changed
    const newValue = this.hiddenInput ? this.hiddenInput.value : "";
    if (oldValue !== newValue) {
      this.triggerChangeEvents(oldValue, newValue);
    }
  }

  // Method to trigger change events for form tracking
  triggerChangeEvents(oldValue, newValue) {
    if (!this.hiddenInput) return;

    // Trigger standard change event
    const changeEvent = new Event("change", { bubbles: true });
    this.hiddenInput.dispatchEvent(changeEvent);

    // Trigger custom event for the form controller
    const customEvent = new CustomEvent("choice-selected", {
      bubbles: true,
      detail: {
        fieldName: this.getFieldName(),
        oldValue: oldValue,
        newValue: newValue,
        hiddenInput: this.hiddenInput,
      },
    });
    this.element.dispatchEvent(customEvent);

    // IMPORTANT: Force a property change event for MutationObserver
    if (this.hiddenInput.value !== newValue) {
      this.hiddenInput.setAttribute("value", newValue);
    }

    console.log(
      `Pass/Fail choice selected: ${this.getFieldName()} = ${newValue}`,
    );
  }

  // Extract field name from hidden input
  getFieldName() {
    if (!this.hiddenInput) return null;

    const id = this.hiddenInput.id;
    if (id.startsWith("hidden_input_")) {
      // Extract field name from ID pattern: hidden_input_form_data_fieldname_...
      const match = id.match(/hidden_input_form_data_(.+?)_/);
      return match ? match[1] : null;
    }
    return null;
  }

  isButtonSelected(button) {
    if (button.classList.contains("radio-choice-button")) {
      // Para radio buttons, verificar las clases de estilo
      return button.classList.contains("from-blue-600");
    } else {
      // Para choice buttons regulares, usar la clase 'selected'
      return button.classList.contains("selected");
    }
  }

  selectButton(button, canToggleOff = true) {
    if (button.classList.contains("radio-choice-button")) {
      this.selectRadioButton(button);
    } else {
      button.classList.add("selected");
    }
  }

  deselectButton(button) {
    if (button.classList.contains("radio-choice-button")) {
      this.deselectRadioButton(button);
    } else {
      button.classList.remove("selected");
    }
  }

  selectRadioButton(button) {
    // Remover clases de estado no seleccionado
    button.classList.remove(
      "bg-white",
      "border-gray-300",
      "text-slate-900",
      "hover:bg-gray-50",
      "hover:border-gray-400",
      "hover:-translate-y-0.5",
      "hover:shadow-lg",
    );

    // Agregar clases de estado seleccionado
    button.classList.add(
      "bg-gradient-to-br",
      "from-blue-600",
      "to-blue-700",
      "border-blue-900",
      "text-white",
      "shadow-xl",
    );

    // Actualizar el indicador del círculo interno
    const radioIndicator = button.querySelector(".radio-indicator div");
    if (radioIndicator) {
      radioIndicator.classList.remove("opacity-0");
      radioIndicator.classList.add("opacity-100");
    }

    // Actualizar data-selected attribute
    button.dataset.selected = "true";
  }

  deselectRadioButton(button) {
    // Remover clases de estado seleccionado
    button.classList.remove(
      "bg-gradient-to-br",
      "from-blue-600",
      "to-blue-700",
      "border-blue-900",
      "text-white",
      "shadow-xl",
    );

    // Agregar clases de estado no seleccionado
    button.classList.add(
      "bg-white",
      "border-gray-300",
      "text-slate-900",
      "hover:bg-gray-50",
      "hover:border-gray-400",
      "hover:-translate-y-0.5",
      "hover:shadow-lg",
    );

    // Actualizar el indicador del círculo interno
    const radioIndicator = button.querySelector(".radio-indicator div");
    if (radioIndicator) {
      radioIndicator.classList.remove("opacity-100");
      radioIndicator.classList.add("opacity-0");
    }

    // Actualizar data-selected attribute
    button.dataset.selected = "false";
  }
}
