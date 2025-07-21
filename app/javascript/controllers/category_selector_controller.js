import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = [
    "modal",
    "modalTitle",
    "systemView",
    "intervalView",
    "systemButtons",
    "intervalButtons",
  ];

  static values = {
    systemCategories: Array,
    intervalCategories: Array,
  };

  connect() {
    this.currentFieldName = null;
    this.currentFieldType = null;
    this.selectedSystemCategory = null;
    this.selectedIntervalCategories = [];
    this.buildCategoryButtons();
  }

  // Open modal for category selection
  openModal(event) {
    this.currentFieldName = event.currentTarget.dataset.fieldName;
    this.currentFieldType = event.currentTarget.dataset.fieldType;

    // Reset selections
    this.selectedSystemCategory = null;
    this.selectedIntervalCategories = [];

    // Update modal title
    this.modalTitleTarget.textContent = `Select ${this.currentFieldType}`;

    // Show appropriate view based on field type
    if (this.currentFieldType === "System Category") {
      this.showSystemView();
    } else if (this.currentFieldType === "Interval Category") {
      this.showIntervalView();
    }

    // Show modal
    this.modalTarget.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  // Close modal
  closeModal() {
    this.modalTarget.classList.add("hidden");
    document.body.style.overflow = "auto";
  }

  // Show system categories view
  showSystemView() {
    this.systemViewTarget.classList.remove("hidden");
    this.intervalViewTarget.classList.add("hidden");
  }

  // Show interval categories view
  showIntervalView() {
    this.systemViewTarget.classList.add("hidden");
    this.intervalViewTarget.classList.remove("hidden");
  }

  // Go back to system selection (for interval category flow)
  backToSystem() {
    this.showSystemView();
  }

  // Build category buttons
  buildCategoryButtons() {
    this.buildSystemButtons();
    this.buildIntervalButtons();
  }

  // Build system category buttons
  buildSystemButtons() {
    this.systemButtonsTarget.innerHTML = "";

    this.systemCategoriesValue.forEach((category) => {
      const button = this.createSystemCategoryButton(category);
      this.systemButtonsTarget.appendChild(button);
    });
  }

  // Build interval category buttons
  buildIntervalButtons() {
    this.intervalButtonsTarget.innerHTML = "";

    this.intervalCategoriesValue.forEach((category) => {
      const button = this.createIntervalCategoryButton(category);
      this.intervalButtonsTarget.appendChild(button);
    });
  }

  // Create system category button
  createSystemCategoryButton(category) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = "click->category-selector#selectSystemCategory";
    button.dataset.categoryId = category.id;
    button.dataset.categoryName = category.name;
    button.className =
      "group flex flex-col items-center justify-center text-center p-4 md:p-6 bg-slate-800/90 border border-white/10 rounded-2xl shadow-lg hover:bg-indigo-600 hover:shadow-indigo-500/50 transition-all duration-300 transform hover:-translate-y-1";

    // Add thumbnail if available
    if (category.thumbnail_url) {
      const img = document.createElement("img");
      img.src = category.thumbnail_url;
      img.alt = category.name;
      img.className = "w-12 h-12 md:w-16 md:h-16 mb-3 object-contain";
      button.appendChild(img);
    } else {
      const fallback = document.createElement("div");
      fallback.className =
        "w-12 h-12 md:w-16 md:h-16 mb-3 flex items-center justify-center bg-slate-700 rounded-full text-indigo-300 text-2xl font-bold";
      fallback.textContent = category.name.charAt(0);
      button.appendChild(fallback);
    }

    const span = document.createElement("span");
    span.className = "font-semibold text-white text-sm md:text-base";
    span.textContent = category.name;
    button.appendChild(span);

    return button;
  }

  // Create interval category button
  createIntervalCategoryButton(category) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = "click->category-selector#toggleIntervalCategory";
    button.dataset.categoryId = category.id;
    button.dataset.categoryName = category.name;
    button.className =
      "interval-category-btn w-full text-left p-6 bg-slate-800/90 border border-white/10 rounded-xl shadow-lg hover:bg-blue-600/50 transition-all duration-200 flex items-center justify-between";

    const nameSpan = document.createElement("span");
    nameSpan.className = "block text-white font-bold text-lg";
    nameSpan.textContent = category.name;
    button.appendChild(nameSpan);

    const checkIconContainer = document.createElement("div");
    checkIconContainer.className =
      "w-6 h-6 rounded-full border-2 border-slate-500 flex-shrink-0 flex items-center justify-center transition-all duration-200";
    checkIconContainer.innerHTML = `<svg class="w-4 h-4 text-white opacity-0 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
    button.appendChild(checkIconContainer);

    return button;
  }

  // Select system category
  selectSystemCategory(event) {
    const categoryId = event.currentTarget.dataset.categoryId;
    const categoryName = event.currentTarget.dataset.categoryName;

    this.selectedSystemCategory = { id: categoryId, name: categoryName };

    if (this.currentFieldType === "System Category") {
      // For system category fields, just select and close
      this.updateFieldWithSelection([categoryName]);
      this.closeModal();
    } else {
      // For interval category fields, proceed to interval selection
      this.showIntervalView();
    }
  }

  // Toggle interval category selection
  toggleIntervalCategory(event) {
    const button = event.currentTarget;
    const categoryId = button.dataset.categoryId;
    const categoryName = button.dataset.categoryName;

    const isSelected = button.classList.contains("selected");

    if (isSelected) {
      // Remove from selection
      this.selectedIntervalCategories = this.selectedIntervalCategories.filter(
        (cat) => cat.id !== categoryId,
      );
      this.toggleIntervalButtonStyle(button, false);
    } else {
      // Add to selection
      this.selectedIntervalCategories.push({
        id: categoryId,
        name: categoryName,
      });
      this.toggleIntervalButtonStyle(button, true);
    }
  }

  // Toggle interval button visual style
  toggleIntervalButtonStyle(button, selected) {
    const checkIconContainer = button.querySelector(".border-2");
    const checkIcon = checkIconContainer.querySelector("svg");

    button.classList.toggle("selected", selected);
    checkIconContainer.classList.toggle("bg-blue-600", selected);
    checkIconContainer.classList.toggle("border-blue-500", selected);
    checkIconContainer.classList.toggle("border-slate-500", !selected);
    checkIcon.classList.toggle("opacity-100", selected);
    checkIcon.classList.toggle("opacity-0", !selected);
  }

  // Confirm selection
  confirmSelection() {
    let selectedNames = [];

    if (
      this.currentFieldType === "System Category" &&
      this.selectedSystemCategory
    ) {
      selectedNames = [this.selectedSystemCategory.name];
    } else if (this.currentFieldType === "Interval Category") {
      selectedNames = this.selectedIntervalCategories.map((cat) => cat.name);
    }

    this.updateFieldWithSelection(selectedNames);
    this.closeModal();
  }

  // Update field with selected categories
  updateFieldWithSelection(selectedNames) {
    // Find the field element
    const fieldElement = document.querySelector(
      `[data-id="${this.currentFieldName}"]`,
    );
    if (!fieldElement) return;

    // Update the selected categories display
    const selectedCategoriesElement = fieldElement.querySelector(
      '[data-field-attribute="selected-categories"]',
    );
    if (selectedCategoriesElement) {
      if (selectedNames.length > 0) {
        selectedCategoriesElement.textContent = selectedNames.join(", ");
        selectedCategoriesElement.classList.remove("italic", "text-purple-300");
        selectedCategoriesElement.classList.add("text-purple-100");
      } else {
        selectedCategoriesElement.innerHTML =
          '<span class="text-purple-300 italic">No categories selected</span>';
      }
    }

    // Update the field data (this will be used when saving the form structure)
    const fieldData = this.getFieldDataFromElement(fieldElement);
    if (fieldData) {
      fieldData.selected_categories = selectedNames;
    }

    // Trigger the drag controller to update the hidden input
    const dragController =
      this.application.getControllerForElementAndIdentifier(
        document.querySelector('[data-controller*="drag"]'),
        "drag",
      );
    if (dragController) {
      dragController.updateHiddenInput();
    }

    // Show success notification
    this.sendNotification(
      `${this.currentFieldType} updated successfully`,
      "success",
    );
  }

  // Get field data from DOM element
  getFieldDataFromElement(fieldElement) {
    const dragController =
      this.application.getControllerForElementAndIdentifier(
        document.querySelector('[data-controller*="drag"]'),
        "drag",
      );

    if (dragController && dragController.extractItemData) {
      return dragController.extractItemData(fieldElement);
    }

    return null;
  }

  // Send notification
  sendNotification(message, type = "info") {
    const event = new CustomEvent("show-notification", {
      detail: { message, type },
      bubbles: true,
    });
    document.dispatchEvent(event);
  }

  // Handle escape key
  handleEscape(event) {
    if (event.key === "Escape") {
      this.closeModal();
    }
  }

  // Connect escape handler
  modalTargetConnected() {
    this.escapeHandler = this.handleEscape.bind(this);
    document.addEventListener("keydown", this.escapeHandler);
  }

  // Disconnect escape handler
  modalTargetDisconnected() {
    if (this.escapeHandler) {
      document.removeEventListener("keydown", this.escapeHandler);
    }
  }
}
