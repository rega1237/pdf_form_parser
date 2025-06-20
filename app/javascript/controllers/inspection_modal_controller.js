// app/javascript/controllers/inspection_modal_controller.js
import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = [
    "formContent",
    "systemSelection",
    "intervalSelection",
    "systemCategoryInput",
    "intervalCategoryInput",
    "systemCategoryDisplay",
    "intervalCategoryDisplay",
  ];

  connect() {
    // Initialize display values if form has existing values
    this.updateDisplayValues();
  }

  updateDisplayValues() {
    // Update system category display
    const systemValue = this.systemCategoryInputTarget.value;
    if (systemValue) {
      this.systemCategoryDisplayTarget.textContent = systemValue;
      this.systemCategoryDisplayTarget.classList.remove("text-slate-400");
      this.systemCategoryDisplayTarget.classList.add("text-white");
    }

    // Update interval category display
    const intervalValue = this.intervalCategoryInputTarget.value;
    if (intervalValue) {
      this.intervalCategoryDisplayTarget.textContent = intervalValue;
      this.intervalCategoryDisplayTarget.classList.remove("text-slate-400");
      this.intervalCategoryDisplayTarget.classList.add("text-white");
    }
  }

  openSystemModal() {
    this.hideAllViews();
    this.showSystemSelection();
  }

  openIntervalModal() {
    this.hideAllViews();
    this.showSystemSelection();
  }

  selectSystemCategory(event) {
    const value = event.currentTarget.dataset.value;

    // Update the hidden input
    this.systemCategoryInputTarget.value = value;

    // Update the display
    this.systemCategoryDisplayTarget.textContent = value;
    this.systemCategoryDisplayTarget.classList.remove("text-slate-400");
    this.systemCategoryDisplayTarget.classList.add("text-white");

    // Show interval selection with animation
    this.hideAllViews();
    setTimeout(() => {
      this.showIntervalSelection();
    }, 150);
  }

  selectIntervalCategory(event) {
    const value = event.currentTarget.dataset.value;

    // Update the hidden input
    this.intervalCategoryInputTarget.value = value;

    // Update the display
    this.intervalCategoryDisplayTarget.textContent = value;
    this.intervalCategoryDisplayTarget.classList.remove("text-slate-400");
    this.intervalCategoryDisplayTarget.classList.add("text-white");

    // Return to form with animation
    this.hideAllViews();
    setTimeout(() => {
      this.showFormContent();
    }, 150);
  }

  backToForm() {
    this.hideAllViews();
    setTimeout(() => {
      this.showFormContent();
    }, 150);
  }

  backToSystemSelection() {
    this.hideAllViews();
    setTimeout(() => {
      this.showSystemSelection();
    }, 150);
  }

  // View management methods
  hideAllViews() {
    this.formContentTarget.classList.add("hidden");
    this.systemSelectionTarget.classList.add("hidden");
    this.intervalSelectionTarget.classList.add("hidden");

    // Add fade out effect
    this.formContentTarget.style.opacity = "0";
    this.systemSelectionTarget.style.opacity = "0";
    this.intervalSelectionTarget.style.opacity = "0";
  }

  showFormContent() {
    this.formContentTarget.classList.remove("hidden");
    this.animateIn(this.formContentTarget);
  }

  showSystemSelection() {
    this.systemSelectionTarget.classList.remove("hidden");
    this.animateIn(this.systemSelectionTarget);
  }

  showIntervalSelection() {
    this.intervalSelectionTarget.classList.remove("hidden");
    this.animateIn(this.intervalSelectionTarget);
  }

  animateIn(element) {
    // Reset opacity and add slide-up animation
    element.style.opacity = "0";
    element.style.transform = "translateY(20px)";

    requestAnimationFrame(() => {
      element.style.transition = "all 0.3s ease-out";
      element.style.opacity = "1";
      element.style.transform = "translateY(0)";
    });
  }

  // Handle escape key
  disconnect() {
    document.removeEventListener("keydown", this.escapeHandler);
  }

  connect() {
    // Initialize display values if form has existing values
    this.updateDisplayValues();

    // Bind escape key
    this.escapeHandler = this.handleEscape.bind(this);
    document.addEventListener("keydown", this.escapeHandler);
  }

  handleEscape(event) {
    if (event.key === "Escape") {
      // If we're in a selection view, go back to form
      if (!this.formContentTarget.classList.contains("hidden")) {
        return; // Already in form
      }
      this.backToForm();
    }
  }
}
