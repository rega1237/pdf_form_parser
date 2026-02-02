import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["customerSelect", "propertySelect"];

  // Triggered when the customer selection changes.
  // Initiates the property loading process or resets the select if no customer is chosen.
  loadProperties() {
    const customerId = this.customerSelectTarget.value;

    if (customerId) {
      this.showLoadingState();
      this.fetchProperties(customerId);
    } else {
      this.resetPropertySelect();
    }
  }

  // Updates the property select UI to indicate data is being fetched.
  showLoadingState() {
    this.propertySelectTarget.innerHTML =
      '<option value="">Loading Properties...</option>';
    this.propertySelectTarget.style.opacity = "0.6";
  }

  // Resets the property select to its default state.
  resetPropertySelect() {
    this.propertySelectTarget.innerHTML =
      '<option value="">Select Property</option>';
    this.propertySelectTarget.style.opacity = "1";
  }

  // Asynchronously fetches properties for the selected customer from the server.
  async fetchProperties(customerId) {
    try {
      const response = await fetch(
        `/inspections/properties_by_customer?customer_id=${customerId}`,
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

  // Populates the property select dropdown with the fetched data.
  populateProperties(properties) {
    this.propertySelectTarget.innerHTML =
      '<option value="">Select Property</option>';

    properties.forEach((property) => {
      const option = document.createElement("option");
      option.value = property.id;
      option.textContent = property.name;
      this.propertySelectTarget.appendChild(option);
    });

    // Restore opacity after population
    this.propertySelectTarget.style.opacity = "1";
  }

  // Updates the property select UI to indicate an error occurred during fetching.
  showErrorState() {
    this.propertySelectTarget.innerHTML =
      '<option value="">Error loading properties</option>';
    this.propertySelectTarget.style.opacity = "1";
  }
}
