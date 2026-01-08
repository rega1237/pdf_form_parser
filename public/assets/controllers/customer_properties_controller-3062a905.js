import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["customerSelect", "propertySelect"];

  connect() {
    // Este método se ejecuta cada vez que el controlador se conecta al DOM
    console.log("CustomerProperties controller connected");
  }

  loadProperties() {
    const customerId = this.customerSelectTarget.value;

    if (customerId) {
      this.showLoadingState();
      this.fetchProperties(customerId);
    } else {
      this.resetPropertySelect();
    }
  }

  showLoadingState() {
    this.propertySelectTarget.innerHTML =
      '<option value="">Cargando propiedades...</option>';
    this.propertySelectTarget.style.opacity = "0.6";
  }

  resetPropertySelect() {
    this.propertySelectTarget.innerHTML =
      '<option value="">Seleccionar propiedad</option>';
    this.propertySelectTarget.style.opacity = "1";
  }

  async fetchProperties(customerId) {
    try {
      const response = await fetch(
        `/inspections/properties_by_customer?customer_id=${customerId}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const properties = await response.json();
      this.populateProperties(properties);
    } catch (error) {
      console.error("Error loading properties:", error);
      this.showErrorState();
    }
  }

  populateProperties(properties) {
    this.propertySelectTarget.innerHTML =
      '<option value="">Seleccionar propiedad</option>';

    properties.forEach((property) => {
      const option = document.createElement("option");
      option.value = property.id;
      option.textContent = property.name;
      this.propertySelectTarget.appendChild(option);
    });

    this.propertySelectTarget.style.opacity = "1";
  }

  showErrorState() {
    this.propertySelectTarget.innerHTML =
      '<option value="">Error cargando propiedades</option>';
    this.propertySelectTarget.style.opacity = "1";
  }
}
