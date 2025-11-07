import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  connect() {
    // Agregar listeners para validación en tiempo real
    this.element.addEventListener("change", this.handleDateChange.bind(this));
    this.element.addEventListener("input", this.handleDateInput.bind(this));
    this.element.addEventListener("blur", this.validateDate.bind(this));

    // Solo establecer fecha cuando el usuario haga focus
    this.element.addEventListener("focus", this.handleFirstFocus.bind(this));

    // También establecer fecha si el campo está en la página actual visible
    if (this.isFieldVisible()) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          this.setInspectionDate();
        }, 100);
      });
    }
  }

  disconnect() {
    this.element.removeEventListener(
      "change",
      this.handleDateChange.bind(this),
    );
    this.element.removeEventListener("input", this.handleDateInput.bind(this));
    this.element.removeEventListener("blur", this.validateDate.bind(this));
    this.element.removeEventListener("focus", this.handleFirstFocus.bind(this));
  }

  setInspectionDate() {
    // Si el campo está vacío, establecer la fecha de inspección
    if (!this.element.value || this.element.value === "") {
      // Antes de establecer por defecto, revisar si existe un valor guardado en data-form-fill-data-value
      const formElement = this.element.closest('[data-controller*="form-fill"]');
      let savedValue = null;
      let fieldName = null;
      if (formElement && this.element.name && this.element.name.startsWith("form_fill[")) {
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
        // Si falla parseo, continuar con lógica normal
      }

      // Si hay un valor guardado para este campo, usarlo silenciosamente y no marcar cambio
      if (savedValue) {
        let valueToSet = savedValue;
        if (typeof valueToSet === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valueToSet)) {
          const [y, m, d] = valueToSet.split("-");
          valueToSet = `${m}/${d}/${y}`;
        }
        this.element.value = valueToSet;
        this.element.setAttribute("value", valueToSet);
        return; // No disparamos eventos para evitar guardados redundantes
      }

      const inspectionDate = this.getInspectionDate();

      if (inspectionDate) {
        this.element.value = inspectionDate;
        this.element.setAttribute("value", inspectionDate);

        // Disparar evento change para notificar otros controladores
        this.element.dispatchEvent(new Event("change", { bubbles: true }));
        this.element.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        // Si no hay fecha de inspección, usar fecha actual como fallback
        this.setCurrentDate();
      }
    } else {
      // Si ya tiene valor, verificar si está en formato ISO y convertir
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

  setCurrentDate() {
    // Método de fallback para usar fecha actual
    const today = new Date();

    // Formato estadounidense: MM/DD/YYYY
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const year = today.getFullYear();

    const usDateFormat = `${month}/${day}/${year}`;

    this.element.value = usDateFormat;
    this.element.setAttribute("value", usDateFormat);

    // Disparar evento change para notificar otros controladores
    this.element.dispatchEvent(new Event("change", { bubbles: true }));
    this.element.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // Get inspection date from form-fill controller
  getInspectionDate() {
    // Find the form-fill controller in the DOM hierarchy
    const formElement = this.element.closest('[data-controller*="form-fill"]');
    if (formElement) {
      // Get the inspection date from the form-fill controller's data attribute
      return formElement.dataset.formFillInspectionDateValue;
    }
    return null;
  }

  handleDateChange(event) {
    this.validateDate();
  }

  handleDateInput(event) {
    // Auto-formatear mientras el usuario escribe
    let value = this.element.value.replace(/\D/g, ""); // Solo números

    if (value.length >= 2) {
      value = value.substring(0, 2) + "/" + value.substring(2);
    }
    if (value.length >= 5) {
      value = value.substring(0, 5) + "/" + value.substring(5, 9);
    }

    this.element.value = value;
  }

  validateDate() {
    const datePattern = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/[0-9]{4}$/;
    const value = this.element.value;

    if (value && !datePattern.test(value)) {
      this.element.classList.add("border-red-500", "bg-red-50");
      this.element.classList.remove("border-blue-800", "bg-white/95");
    } else {
      this.element.classList.remove("border-red-500", "bg-red-50");
      this.element.classList.add("border-blue-800", "bg-white/95");
    }
  }

  // Método para convertir una fecha ISO a formato estadounidense
  convertISOToUS(isoDate) {
    if (isoDate && isoDate.includes("-")) {
      const [year, month, day] = isoDate.split("-");
      return `${month}/${day}/${year}`;
    }
    return isoDate;
  }

  // Método público para establecer una fecha específica
  setDate(dateString) {
    if (dateString) {
      this.element.value = dateString;
      this.element.setAttribute("value", dateString);
      this.element.dispatchEvent(new Event("change", { bubbles: true }));
      this.element.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  // Método público para establecer la fecha de inspección
  setInspectionDateIfEmpty() {
    if (!this.element.value || this.element.value === "") {
      this.setInspectionDate();
    }
  }

  // Método para manejar el primer focus del usuario
  handleFirstFocus(event) {
    if (!this.element.value || this.element.value === "") {
      this.setInspectionDate();
    }
    // Remover el listener después del primer uso
    this.element.removeEventListener("focus", this.handleFirstFocus.bind(this));
  }

  // Método para verificar si el campo está visible
  isFieldVisible() {
    // Verificar si el campo está en una página visible
    const pageContent = this.element.closest(".page-content");
    if (pageContent) {
      // Si está en un contenedor de página, verificar si no está oculto
      return !pageContent.classList.contains("hidden");
    }

    // Verificar si el elemento está visible en general
    const rect = this.element.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      window.getComputedStyle(this.element).visibility !== "hidden"
    );
  }
}
