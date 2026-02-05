import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  // Initializes the controller and sets up the page change listener
  connect() {
    // Bind the function to the correct context to use 'this' inside it
    this.handlePageChange = this.handlePageChange.bind(this);
    
    // Listen for the 'pageChanged' event triggered by the pagination controller
    this.element.addEventListener("pageChanged", this.handlePageChange);

    // Initial setup for the first page loaded
    this.handlePageChange();
  }

  // Cleans up event listeners when the controller is disconnected
  disconnect() {
    // Good practice to remove event listeners when the controller disconnects
    this.element.removeEventListener("pageChanged", this.handlePageChange);
  }

  // Updates the controller state when the active page changes
  handlePageChange() {
    // Find the currently active page
    const currentPage = this.element.querySelector('.page-content:not(.hidden)');
    if (!currentPage) return;

    // Find the specific elements within THIS page and store them
    this.toggleButton = currentPage.querySelector('[data-field-toggle-target="toggleButton"]');
    this.toggleIcon = currentPage.querySelector('[data-field-toggle-target="toggleIcon"]');
    this.toggleText = currentPage.querySelector('[data-field-toggle-target="toggleText"]');
    this.additionalFields = currentPage.querySelector('[data-field-toggle-target="additionalFields"]');
    
    // Reset state to "not expanded" every time we change page
    this.isExpanded = false;
  }

  // Toggles the visibility of additional fields
  toggleFields() {
    // Verify that elements exist on the current page
    if (!this.toggleButton || !this.additionalFields) {
      console.error("Toggle elements not found on the current page.");
      return;
    }

    this.isExpanded = !this.isExpanded;
    
    // Apply classes to show/hide fields and animate the icon
    this.additionalFields.classList.toggle('show', this.isExpanded);
    this.toggleIcon.classList.toggle('rotated', this.isExpanded);
    this.toggleButton.classList.toggle('expanded', this.isExpanded);

    // Update button text
    const text = this.toggleText.textContent;
    if (this.isExpanded) {
      this.toggleText.textContent = text.replace('Show', 'Hide');
    } else {
      this.toggleText.textContent = text.replace('Hide', 'Show');
    }
  }
}