import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  // Sets up event listeners for date handling and auto-fills inspection date if applicable
  connect() {
    this.element.addEventListener("change", this.handleDateChange.bind(this));
    this.element.addEventListener("input", this.handleDateInput.bind(this));
    this.element.addEventListener("blur", this.validateDate.bind(this));

    // Only set date when user focuses
    this.element.addEventListener("focus", this.handleFirstFocus.bind(this));

    // Also set date if field is currently visible
    if (this.isFieldVisible()) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          this.setInspectionDate();
        }, 100);
      });
    }
  }

  // Removes event listeners when the controller is disconnected
  disconnect() {
    this.element.removeEventListener(
      "change",
      this.handleDateChange.bind(this),
    );
    this.element.removeEventListener("input", this.handleDateInput.bind(this));
    this.element.removeEventListener("blur", this.validateDate.bind(this));
    this.element.removeEventListener("focus", this.handleFirstFocus.bind(this));
  }

  // Sets the inspection date if the field is empty, handling saved values and formats
  setInspectionDate() {
    // If field is empty, set inspection date
    if (!this.element.value || this.element.value === "") {
      // Before setting default, check if there is a saved value in data-form-fill-data-value
      const formElement = this.element.closest(
        '[data-controller*="form-fill"]',
      );
      let savedValue = null;
      let fieldName = null;
      if (
        formElement &&
        this.element.name &&
        this.element.name.startsWith("form_fill[")
      ) {
        const match = this.element.name.match(/form_fill\[(.+)\]/);
        fieldName = match ? match[1] : null;
      }
      try {
        const rawData = formElement?.dataset?.formFillDataValue;
        if (rawData && fieldName) {
          const parsed = JSON.parse(rawData);
          if (parsed && parsed[fieldName]) {
            savedValue = parsed[fieldName];
          }
        }
      } catch (e) {
        // If parsing fails, continue with normal logic
      }

      // If there is a saved value for this field, use it silently and do not mark change
      if (savedValue) {
        let valueToSet = savedValue;
        if (typeof valueToSet === "string") {
          if (/^\d{4}-\d{2}-\d{2}$/.test(valueToSet)) {
            const [y, m, d] = valueToSet.split("-");
            valueToSet = `${m}/${d}/${y.slice(-2)}`;
          } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(valueToSet)) {
            // Convert MM/DD/YYYY to MM/DD/YY
            valueToSet = valueToSet.substring(0, 6) + valueToSet.substring(8);
          }
        }
        this.element.value = valueToSet;
        this.element.setAttribute("value", valueToSet);
        return; // Do not trigger events to avoid redundant saves
      }

      const inspectionDate = this.getInspectionDate();

      if (inspectionDate) {
        let valueToSet = inspectionDate;
        // Ensure 2-digit year if it comes as 4 digits
        if (
          typeof valueToSet === "string" &&
          /^\d{2}\/\d{2}\/\d{4}$/.test(valueToSet)
        ) {
          valueToSet = valueToSet.substring(0, 6) + valueToSet.substring(8);
        }

        this.element.value = valueToSet;
        this.element.setAttribute("value", valueToSet);

        // Trigger change event to notify other controllers
        this.element.dispatchEvent(new Event("change", { bubbles: true }));
        this.element.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        // If no inspection date, use current date as fallback
        this.setCurrentDate();
      }
    } else {
      // If it already has value, check if it is in ISO format and convert
      const currentValue = this.element.value;
      if (
        currentValue.includes("-") &&
        currentValue.match(/^\d{4}-\d{2}-\d{2}$/)
      ) {
        const convertedValue = this.convertISOToUS(currentValue);
        this.element.value = convertedValue;
      }
    }
  }

  // Sets the current date in US format (MM/DD/YY)
  setCurrentDate() {
    // Fallback method to use current date
    const today = new Date();

    // US Format: MM/DD/YY
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const year = String(today.getFullYear()).slice(-2);

    const usDateFormat = `${month}/${day}/${year}`;

    this.element.value = usDateFormat;
    this.element.setAttribute("value", usDateFormat);

    // Trigger change event to notify other controllers
    this.element.dispatchEvent(new Event("change", { bubbles: true }));
    this.element.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // Retrieves the inspection date from the parent form-fill controller
  getInspectionDate() {
    // Find the form-fill controller in the DOM hierarchy
    const formElement = this.element.closest('[data-controller*="form-fill"]');
    if (formElement) {
      // Get the inspection date from the form-fill controller's data attribute
      return formElement.dataset.formFillInspectionDateValue;
    }
    return null;
  }

  // Validates the date format on change
  handleDateChange(event) {
    this.validateDate();
  }

  // Formats the date input in real-time as the user types
  handleDateInput(event) {
    // Auto-format while user types
    let value = this.element.value.replace(/\D/g, ""); // Only numbers

    if (value.length >= 2) {
      value = value.substring(0, 2) + "/" + value.substring(2);
    }
    if (value.length >= 5) {
      value = value.substring(0, 5) + "/" + value.substring(5, 7);
    }

    this.element.value = value;
  }

  // Validates the date string against the MM/DD/YY pattern and updates visual feedback
  validateDate() {
    const datePattern = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/[0-9]{2}$/;
    const value = this.element.value;

    if (value && !datePattern.test(value)) {
      this.element.classList.add("border-red-500", "bg-red-50");
      this.element.classList.remove("border-blue-800", "bg-white/95");
    } else {
      this.element.classList.remove("border-red-500", "bg-red-50");
      this.element.classList.add("border-blue-800", "bg-white/95");
    }
  }

  // Converts an ISO date string (YYYY-MM-DD) to US format (MM/DD/YY)
  convertISOToUS(isoDate) {
    if (isoDate && isoDate.includes("-")) {
      const [year, month, day] = isoDate.split("-");
      return `${month}/${day}/${year.slice(-2)}`;
    }
    return isoDate;
  }

  // Public method to set a specific date string programmatically
  setDate(dateString) {
    if (dateString) {
      this.element.value = dateString;
      this.element.setAttribute("value", dateString);
      this.element.dispatchEvent(new Event("change", { bubbles: true }));
      this.element.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  // Public method to set inspection date if the field is currently empty
  setInspectionDateIfEmpty() {
    if (!this.element.value || this.element.value === "") {
      this.setInspectionDate();
    }
  }

  // Handles the first focus event to populate the inspection date
  handleFirstFocus(event) {
    if (!this.element.value || this.element.value === "") {
      this.setInspectionDate();
    }
    // Remove listener after first use
    this.element.removeEventListener("focus", this.handleFirstFocus.bind(this));
  }

  // Checks if the field is currently visible in the viewport or active page
  isFieldVisible() {
    // Check if field is in a visible page
    const pageContent = this.element.closest(".page-content");
    if (pageContent) {
      // If in a page container, check if not hidden
      return !pageContent.classList.contains("hidden");
    }

    // Check if element is visible in general
    const rect = this.element.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      window.getComputedStyle(this.element).visibility !== "hidden"
    );
  }
}
