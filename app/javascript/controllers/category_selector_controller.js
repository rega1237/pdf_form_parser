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

  // Initializes the controller state and builds category buttons
  connect() {
    this.currentFieldName = null;
    this.currentFieldType = null;
    this.selectedSystemCategory = null;
    this.selectedIntervalCategories = [];
    this.buildCategoryButtons();
  }

  // Opens the modal and sets up the view based on the event's dataset
  openModal(event) {
    this.currentFieldName = event.currentTarget.dataset.fieldName;
    this.currentFieldType = event.currentTarget.dataset.fieldType;

    this.selectedSystemCategory = null;
    this.selectedIntervalCategories = [];

    this.modalTitleTarget.textContent = `Select ${this.currentFieldType}`;

    if (this.currentFieldType === "System Category") {
      this.showSystemView();
    } else if (this.currentFieldType === "Interval Category") {
      this.showIntervalView();
    }

    this.modalTarget.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  // Closes the modal and restores body overflow
  closeModal() {
    this.modalTarget.classList.add("hidden");
    document.body.style.overflow = "auto";
  }

  // Displays the system categories view and hides the interval view
  showSystemView() {
    this.systemViewTarget.classList.remove("hidden");
    this.intervalViewTarget.classList.add("hidden");
  }

  // Displays the interval categories view and hides the system view
  showIntervalView() {
    this.systemViewTarget.classList.add("hidden");
    this.intervalViewTarget.classList.remove("hidden");
  }

  // Returns to the system view from the interval view
  backToSystem() {
    this.showSystemView();
  }

  // Triggers the construction of both system and interval category buttons
  buildCategoryButtons() {
    this.buildSystemButtons();
    this.buildIntervalButtons();
  }

  // Builds and appends system category buttons to the DOM
  buildSystemButtons() {
    this.systemButtonsTarget.innerHTML = "";

    this.systemCategoriesValue.forEach((category) => {
      const button = this.createSystemCategoryButton(category);
      this.systemButtonsTarget.appendChild(button);
    });
  }

  // Builds and appends interval category buttons to the DOM
  buildIntervalButtons() {
    this.intervalButtonsTarget.innerHTML = "";

    this.intervalCategoriesValue.forEach((category) => {
      const button = this.createIntervalCategoryButton(category);
      this.intervalButtonsTarget.appendChild(button);
    });
  }

  // Creates a button element for a system category
  createSystemCategoryButton(category) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = "click->category-selector#selectSystemCategory";
    button.dataset.categoryId = category.id;
    button.dataset.categoryName = category.name;
    button.className =
      "group flex flex-col items-center justify-center text-center p-4 md:p-6 bg-slate-800/90 border border-white/10 rounded-2xl shadow-lg hover:bg-indigo-600 hover:shadow-indigo-500/50 transition-all duration-300 transform hover:-translate-y-1";

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

  // Creates a button element for an interval category
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

  // Handles the selection of a system category
  selectSystemCategory(event) {
    const categoryId = event.currentTarget.dataset.categoryId;
    const categoryName = event.currentTarget.dataset.categoryName;

    this.selectedSystemCategory = { id: categoryId, name: categoryName };

    if (this.currentFieldType === "System Category") {
      this.updateFieldWithSelection([categoryName]);
      this.closeModal();
    } else {
      this.showIntervalView();
    }
  }

  // Toggles the selection state of an interval category
  toggleIntervalCategory(event) {
    const button = event.currentTarget;
    const categoryId = button.dataset.categoryId;
    const categoryName = button.dataset.categoryName;

    const isSelected = button.classList.contains("selected");

    if (isSelected) {
      this.selectedIntervalCategories = this.selectedIntervalCategories.filter(
        (cat) => cat.id !== categoryId,
      );
      this.toggleIntervalButtonStyle(button, false);
    } else {
      this.selectedIntervalCategories.push({
        id: categoryId,
        name: categoryName,
      });
      this.toggleIntervalButtonStyle(button, true);
    }
  }

  // Updates the visual style of an interval category button based on selection state
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

  // Confirms the current selection and updates the field
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

  // Updates the associated field element with the selected category names
  updateFieldWithSelection(selectedNames) {
    const fieldElement = document.querySelector(
      `[data-id="${this.currentFieldName}"]`,
    );
    if (!fieldElement) return;

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

    const fieldData = this.getFieldDataFromElement(fieldElement);
    if (fieldData) {
      fieldData.selected_categories = selectedNames;
    }

    const dragController =
      this.application.getControllerForElementAndIdentifier(
        document.querySelector('[data-controller*="drag"]'),
        "drag",
      );
    if (dragController) {
      dragController.updateHiddenInput();
    }

    this.sendNotification(
      `${this.currentFieldType} updated successfully`,
      "success",
    );
  }

  // Retrieves the data object associated with a field element
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

  // Dispatches a notification event
  sendNotification(message, type = "info") {
    const event = new CustomEvent("show-notification", {
      detail: { message, type },
      bubbles: true,
    });
    document.dispatchEvent(event);
  }

  // Handles keydown events to close the modal on Escape
  handleEscape(event) {
    if (event.key === "Escape") {
      this.closeModal();
    }
  }

  // Adds event listeners when the modal target is connected
  modalTargetConnected() {
    this.escapeHandler = this.handleEscape.bind(this);
    document.addEventListener("keydown", this.escapeHandler);
  }

  // Removes event listeners when the modal target is disconnected
  modalTargetDisconnected() {
    if (this.escapeHandler) {
      document.removeEventListener("keydown", this.escapeHandler);
    }
  }
}
