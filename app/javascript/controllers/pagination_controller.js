import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["pageContent", "backPageBtn", "nextPageBtn"];

  connect() {
    this.currentPage = 0;
    this.totalPages = this.pageContentTargets.length;
    this.showCurrentPage();
    this.updateButtonStates();
    this.updateProgress();
    this.setupFieldValidation();
    
    // Listen for choice-selected events from Pass/Fail buttons
    this.element.addEventListener('choice-selected', this.handleChoiceSelected.bind(this));
    
    // Listen for field validation changes
    this.element.addEventListener('field-validation-changed', this.handleValidationChange.bind(this));
  }

  disconnect() {
    // Clean up event listeners
    this.element.removeEventListener('choice-selected', this.handleChoiceSelected.bind(this));
    this.element.removeEventListener('field-validation-changed', this.handleValidationChange.bind(this));
  }

  // Handle choice selection events (Pass/Fail buttons)
  handleChoiceSelected(event) {
    console.log('Pagination: Choice selected event received:', event.detail);
    
    // Small delay to ensure DOM is updated
    setTimeout(() => {
      this.validateCurrentPage();
    }, 100);
  }

  // Handle general field validation changes
  handleValidationChange(event) {
    console.log('Pagination: Field validation changed:', event.detail);
    this.validateCurrentPage();
  }

  setupFieldValidation() {
    this.pageContentTargets.forEach((page) => {
      const inputs = page.querySelectorAll("input, select, textarea");
      inputs.forEach((input) => {
        input.addEventListener("input", () => {
          this.debounceValidation();
        });
        input.addEventListener("change", () => {
          this.debounceValidation();
        });
      });

      const choiceButtons = page.querySelectorAll(
        ".choice-button, .radio-choice-button",
      );
      choiceButtons.forEach((button) => {
        button.addEventListener("click", () => {
          setTimeout(() => this.validateCurrentPage(), 100);
        });
      });
    });
  }

  debounceValidation() {
    clearTimeout(this.validationTimeout);
    this.validationTimeout = setTimeout(() => {
      this.validateCurrentPage();
    }, 300);
  }

  nextPage(event) {
    if (this.nextPageBtnTarget.classList.contains("is-disabled")) {
      this.showValidationMessage();
      event.stopImmediatePropagation();
      return;
    }

    this.changeToNextPage();
  }

  validateCurrentPage() {
    const currentPageElement = this.pageContentTargets[this.currentPage];
    if (!currentPageElement) return;

    const requiredFields = this.getRequiredFieldsOnPage(currentPageElement);
    const emptyRequiredFields = requiredFields.filter((field) => {
      const fieldValue = this.getFieldValue(field);
      const hasValue = fieldValue && fieldValue.trim() !== "";
      
      // Enhanced logging for Pass/Fail fields
      const fieldType = field.dataset.fieldType;
      const fieldName = field.dataset.fieldName;
      
      if (fieldType === "Pass/Fail") {
        console.log(`Validating Pass/Fail field "${fieldName}": value="${fieldValue}", hasValue=${hasValue}`);
      }
      
      return !hasValue;
    });

    const isValid = emptyRequiredFields.length === 0;

    // Enhanced logging
    console.log(`Page ${this.currentPage + 1} validation result: ${isValid} (${emptyRequiredFields.length} empty required fields)`);
    
    this.nextPageBtnTarget.classList.toggle("is-disabled", !isValid);
    
    return isValid;
  }

  changeToNextPage() {
    let pageIncrement = 1;
    const currentPageElement = this.pageContentTargets[this.currentPage];
    const skipTriggerElement = currentPageElement.querySelector(
      '[data-pagination-skip-trigger="true"]',
    );

    if (skipTriggerElement) {
      const fieldContainer = skipTriggerElement.closest(
        '[data-field-type="Pass/Fail"]',
      );
      if (fieldContainer) {
        const value = this.getFieldValue(fieldContainer);
        if (value === "Pass" || value === "N/A") {
          pageIncrement = 2;
        }
      }
    }

    if (this.currentPage < this.totalPages - 1) {
      this.currentPage = Math.min(
        this.currentPage + pageIncrement,
        this.totalPages - 1,
      );
      this.showCurrentPage();
      this.updateButtonStates();
      this.updateProgress();
      this.notifyPageChange();
    }
  }

  showValidationMessage() {
    this.hideValidationMessage();
    const message = document.createElement("div");
    message.id = "validation-message";
    message.className =
      "fixed top-4 right-4 bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg z-50 max-w-sm animate-fade-in";
    message.innerHTML = `<div class="font-semibold">Please fill all required fields to continue.</div>`;
    document.body.appendChild(message);
    setTimeout(() => this.hideValidationMessage(), 3000);
  }

  hideValidationMessage() {
    const existingMessage = document.getElementById("validation-message");
    if (existingMessage) {
      existingMessage.remove();
    }
  }

  getRequiredFieldsOnPage(pageElement) {
    return Array.from(pageElement.querySelectorAll('[data-required="true"]'));
  }

  getFieldValue(fieldContainer) {
    const fieldType = fieldContainer.dataset.fieldType;
    const fieldName = fieldContainer.dataset.fieldName;

    // First try to get value from data column if available
    const dataColumnValue = this.getValueFromDataColumn(fieldName, fieldType);

    if (dataColumnValue !== null && dataColumnValue !== "") {
      return dataColumnValue;
    }

    // Enhanced DOM-based value extraction for Pass/Fail
    switch (fieldType) {
      case "Pass/Fail":
        // Try multiple methods to get Pass/Fail value
        let passfailValue = "";
        
        // Method 1: Hidden input
        const hiddenInput = fieldContainer.querySelector('input[type="hidden"]');
        if (hiddenInput && hiddenInput.value) {
          passfailValue = hiddenInput.value;
        }
        
        // Method 2: Selected button (fallback)
        if (!passfailValue) {
          const selectedButton = fieldContainer.querySelector('.choice-button.selected, .radio-choice-button[data-selected="true"]');
          if (selectedButton) {
            passfailValue = selectedButton.dataset.value || "";
          }
        }
        
        // Method 3: Button with selected styling (fallback)
        if (!passfailValue) {
          const styledButton = fieldContainer.querySelector('.choice-button, .radio-choice-button');
          if (styledButton && (styledButton.classList.contains('from-blue-600') || styledButton.classList.contains('selected'))) {
            passfailValue = styledButton.dataset.value || "";
          }
        }
        
        console.log(`Pass/Fail field "${fieldName}" value extraction: "${passfailValue}"`);
        return passfailValue;
        
      case "Radio":
        return (
          fieldContainer.querySelector('input[type="hidden"]')?.value || ""
        );
      case "Photo":
        const fileInput = fieldContainer.querySelector('input[type="file"]');
        const previewContainer = fieldContainer.querySelector(
          '[data-photo-capture-target="preview"]',
        );
        const hasExistingPhoto =
          previewContainer && !previewContainer.classList.contains("hidden");
        return fileInput?.files.length > 0 || hasExistingPhoto
          ? "photo_present"
          : "";
      case "Deficiency":
        const riserInput = fieldContainer.querySelector('input[type="number"]');
        const selectInput = fieldContainer.querySelector("select, input[id$='_select']");
        return riserInput?.value && selectInput?.value
          ? `${riserInput.value}_${selectInput.value}`
          : "";
      case "Button":
        return fieldContainer.querySelector('input[type="checkbox"]')?.checked
          ? "checked"
          : "";
      default:
        return (
          fieldContainer.querySelector("input, select, textarea")?.value || ""
        );
    }
  }

  // Extract field name from field container
  extractFieldNameFromContainer(fieldContainer) {
    // First try to get it from data attribute
    if (fieldContainer.dataset.fieldName) {
      return fieldContainer.dataset.fieldName;
    }
    
    // Fallback to input name extraction
    const input = fieldContainer.querySelector("input, select, textarea");
    if (input && input.name && input.name.startsWith("form_fill[")) {
      const match = input.name.match(/form_fill\[(.+)\]/);
      return match ? match[1] : null;
    }
    return null;
  }

  // Get value from data column for validation
  getValueFromDataColumn(fieldName, fieldType) {
    if (!fieldName) return null;

    try {
      // Try multiple methods to get form data
      let data = null;
      
      // Method 1: From form-fill controller data
      const formFillElement = document.querySelector('[data-controller*="form-fill"]');
      if (formFillElement) {
        // Try to get from form structure first
        const structureValue = formFillElement.dataset.formFillFormStructureValue;
        if (structureValue) {
          const structure = JSON.parse(structureValue);
          const fieldData = structure.find(field => field.name === fieldName);
          if (fieldData && fieldData.value) {
            return fieldData.value;
          }
        }
        
        // Try to get from data value
        const dataValue = formFillElement.dataset.formFillDataValue;
        if (dataValue) {
          data = JSON.parse(dataValue);
        }
      }

      // Method 2: Try to get from Rails data (if available)
      if (!data && window.formFillData) {
        data = window.formFillData;
      }

      if (!data) return null;

      switch (fieldType) {
        case "Pass/Fail":
          return data[fieldName] || "";
        case "Photo":
          const attachmentKey = `${fieldName}_attachment_id`;
          return data[attachmentKey] && data[attachmentKey].trim() !== ""
            ? "photo_present"
            : "";
        case "Deficiency":
          const selectValue = data[`${fieldName}_select`];
          const riserValue = data[`${fieldName}_riser`];
          return selectValue && riserValue
            ? `${riserValue}_${selectValue}`
            : "";
        default:
          return data[fieldName] || "";
      }
    } catch (error) {
      console.error("Error getting value from data column:", error);
      return null;
    }
  }

  backPage() {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.showCurrentPage();
      this.updateButtonStates();
      this.updateProgress();
      this.notifyPageChange();
    }
  }

  showCurrentPage() {
    this.pageContentTargets.forEach((page, index) => {
      page.classList.toggle("hidden", index !== this.currentPage);
    });
  }

  updateButtonStates() {
    this.backPageBtnTarget.disabled = this.currentPage === 0;
    this.validateCurrentPage();
  }

  updateProgress() {
    const progressBar = document.getElementById("progress-bar");
    const pageIndicator = document.getElementById("page-indicator");
    if (progressBar && pageIndicator) {
      const progressPercentage =
        ((this.currentPage + 1) / this.totalPages) * 100;
      progressBar.style.width = `${progressPercentage}%`;
      pageIndicator.textContent = `Page ${this.currentPage + 1} of ${this.totalPages}`;
    }
  }

  notifyPageChange() {
    this.triggerIncrementalSave();
    this.element.dispatchEvent(new CustomEvent("pageChanged", { bubbles: true }));
  }

  // Trigger incremental save for current page data
  triggerIncrementalSave() {
    const formFillElement = document.querySelector(
      '[data-controller*="form-fill"]',
    );
    if (formFillElement) {
      const formFillController = this.getFormFillController(formFillElement);
      if (formFillController && formFillController.saveDraftIncremental) {
        // Trigger incremental save instead of full save
        formFillController.saveDraftIncremental();
      } else {
        // Fallback: dispatch custom event for incremental save
        const saveEvent = new CustomEvent("trigger-incremental-save", {
          bubbles: true,
          detail: { source: "pagination" },
        });
        formFillElement.dispatchEvent(saveEvent);
      }
    }
  }

  // Get form fill controller instance
  getFormFillController(formFillElement) {
    try {
      if (formFillElement && this.application) {
        const controller =
          this.application.getControllerForElementAndIdentifier(
            formFillElement,
            "form-fill",
          );
        if (controller) {
          return controller;
        }
      }

      // Fallback methods
      if (formFillElement && formFillElement.formFillController) {
        return formFillElement.formFillController;
      }

      if (window.Stimulus && formFillElement) {
        const controller = window.Stimulus.getControllerForElementAndIdentifier(
          formFillElement,
          "form-fill",
        );
        if (controller) {
          return controller;
        }
      }

      return null;
    } catch (error) {
      console.error("Error getting form fill controller:", error);
      return null;
    }
  }
}