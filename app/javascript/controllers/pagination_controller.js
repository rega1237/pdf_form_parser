import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = [
    "pageContent",
    "backPageBtn",
    "nextPageBtn",
    "submitFormBtn",
  ];

  connect() {
    this.currentPage = 0;
    this.totalPages = this.pageContentTargets.length;
    this.updateButtonStates();
    this.showCurrentPage();
    this.updateProgress();
    this.setupFieldValidation();
    
    // Don't show error messages immediately, but do validate for button state
    this.hasUserInteracted = false;
    this.validationTimeout = null;
    
    // Initial validation to set correct button state (disabled if required fields empty)
    setTimeout(() => {
      this.validateCurrentPageForButtonState();
    }, 100);
  }

  setupFieldValidation() {
    // Add event listeners to all form inputs for real-time validation
    this.pageContentTargets.forEach((page, pageIndex) => {
      const inputs = page.querySelectorAll('input, select, textarea');
      inputs.forEach(input => {
        // Mark that user has interacted when they start using the form
        input.addEventListener('focus', () => {
          this.hasUserInteracted = true;
        });
        
        input.addEventListener('input', () => {
          this.hasUserInteracted = true;
          this.debounceValidation();
        });
        
        input.addEventListener('change', () => {
          this.hasUserInteracted = true;
          this.debounceValidation();
        });
      });

      // Add listeners to choice buttons (Pass/Fail, Radio buttons)
      const choiceButtons = page.querySelectorAll('.choice-button, .radio-choice-button');
      choiceButtons.forEach(button => {
        button.addEventListener('click', () => {
          this.hasUserInteracted = true;
          // Add small delay to allow choice-buttons controller to update hidden input
          setTimeout(() => this.validateCurrentPage(), 100);
        });
      });

      // Add listeners to checkbox buttons
      const checkboxButtons = page.querySelectorAll('.checkbox-button input[type="checkbox"]');
      checkboxButtons.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
          this.hasUserInteracted = true;
          this.debounceValidation();
        });
      });
    });
  }

  debounceValidation() {
    // Clear existing timeout
    if (this.validationTimeout) {
      clearTimeout(this.validationTimeout);
    }
    
    // Set new timeout for validation
    this.validationTimeout = setTimeout(() => {
      this.validateCurrentPage();
    }, 300);
  }

  validateCurrentPage() {
    // Always validate for button state, but only show messages if user has interacted
    const currentPageElement = this.pageContentTargets[this.currentPage];
    if (!currentPageElement) return true;

    const requiredFields = this.getRequiredFieldsOnPage(currentPageElement);
    const emptyRequiredFields = [];

    requiredFields.forEach(field => {
      const fieldValue = this.getFieldValue(field);
      if (!fieldValue || fieldValue.trim() === '') {
        emptyRequiredFields.push(field);
      }
    });

    // Update next button state based on validation
    const isValid = emptyRequiredFields.length === 0;
    this.updateNextButtonState(isValid, emptyRequiredFields);
    
    return isValid;
  }

  // New method for initial validation without showing error messages
  validateCurrentPageForButtonState() {
    const currentPageElement = this.pageContentTargets[this.currentPage];
    if (!currentPageElement) return true;

    const requiredFields = this.getRequiredFieldsOnPage(currentPageElement);
    const emptyRequiredFields = [];

    requiredFields.forEach(field => {
      const fieldValue = this.getFieldValue(field);
      if (!fieldValue || fieldValue.trim() === '') {
        emptyRequiredFields.push(field);
      }
    });

    // Update button state but don't show validation messages
    const isValid = emptyRequiredFields.length === 0;
    this.updateNextButtonStateOnly(isValid);
    
    return isValid;
  }

  getRequiredFieldsOnPage(pageElement) {
    const requiredFields = [];
    
    // Get all field containers on the current page
    const fieldContainers = pageElement.querySelectorAll('[data-field-type]');
    
    fieldContainers.forEach(container => {
      const fieldType = container.dataset.fieldType;
      
      // Check if this field is marked as required in the form structure
      if (this.isFieldRequired(container)) {
        requiredFields.push({
          container: container,
          type: fieldType,
          name: this.getFieldName(container)
        });
      }
    });
    
    return requiredFields;
  }

  isFieldRequired(fieldContainer) {
    // Option 1: Check for a data attribute
    if (fieldContainer.hasAttribute('data-required') && fieldContainer.dataset.required === 'true') {
      return true;
    }
    
    // Option 2: Check the form structure data (if available)
    try {
      const formController = document.querySelector('[data-controller*="form-fill"]');
      if (formController) {
        const formStructure = JSON.parse(formController.dataset.formFillFormStructureValue || '[]');
        const fieldName = this.getFieldName(fieldContainer);
        const fieldData = formStructure.find(field => field.name === fieldName);
        return fieldData && fieldData.required === true;
      }
    } catch (error) {
      console.warn('Could not parse form structure for required field validation:', error);
    }
    
    return false;
  }

  getFieldName(fieldContainer) {
    // Try to get field name from data attribute first
    if (fieldContainer.dataset.fieldName) {
      return fieldContainer.dataset.fieldName;
    }
    
    // Try to find the field name from various possible sources
    const input = fieldContainer.querySelector('input, select, textarea');
    if (input && input.name) {
      // Extract field name from Rails form naming convention: form_fill[field_name]
      const match = input.name.match(/form_fill\[([^\]]+)\]/);
      return match ? match[1] : input.name;
    }
    return '';
  }

  getFieldValue(field) {
    const { container, type, name } = field;
    
    switch (type) {
      case 'Pass/Fail':
        // Check for hidden input that stores the selected value
        const hiddenInput = container.querySelector('input[type="hidden"]');
        const hiddenValue = hiddenInput ? hiddenInput.value : '';
        console.log(`Pass/Fail field "${name}" value:`, hiddenValue);
        return hiddenValue;
      
      case 'Photo':
        // Check if photo has been captured/uploaded
        const fileInput = container.querySelector('input[type="file"]');
        const previewContainer = container.querySelector('[data-photo-capture-target="preview"]');
        const hasExistingPhoto = container.querySelector('img[src]');
        
        // Check if file input has files
        const hasFileUploaded = fileInput && fileInput.files && fileInput.files.length > 0;
        
        // Check if preview is visible (indicates photo exists)
        const hasVisiblePreview = previewContainer && !previewContainer.classList.contains('hidden');
        
        // Check if there's an existing photo with valid src
        const hasValidExistingPhoto = hasExistingPhoto && hasExistingPhoto.src && 
                                    hasExistingPhoto.src !== '' && 
                                    hasExistingPhoto.src !== window.location.href;
        
        const photoValue = (hasFileUploaded || hasVisiblePreview || hasValidExistingPhoto) ? 'photo' : '';
        console.log(`Photo field "${name}" value:`, photoValue, {
          hasFileUploaded,
          hasVisiblePreview,
          hasValidExistingPhoto
        });
        return photoValue;
      
      case 'Deficiency':
        // For deficiency fields, check riser number and selection
        const riserInput = container.querySelector('input[type="number"]');
        const selectInput = container.querySelector('select');
        
        const riserValue = riserInput ? riserInput.value : '';
        const selectValue = selectInput ? selectInput.value : '';
        
        const deficiencyValue = (riserValue && selectValue) ? `${riserValue}_${selectValue}` : '';
        console.log(`Deficiency field "${name}" value:`, deficiencyValue, {
          riserValue,
          selectValue
        });
        return deficiencyValue;
      
      case 'Button':
        // Check if checkbox is checked
        const checkbox = container.querySelector('input[type="checkbox"]');
        const buttonValue = checkbox && checkbox.checked ? 'checked' : '';
        console.log(`Button field "${name}" value:`, buttonValue);
        return buttonValue;
      
      case 'Radio':
        // Check for hidden input that stores the selected value
        const radioHiddenInput = container.querySelector('input[type="hidden"]');
        const radioValue = radioHiddenInput ? radioHiddenInput.value : '';
        console.log(`Radio field "${name}" value:`, radioValue);
        return radioValue;
      
      case 'Text':
      case 'Date':
      case 'Choice':
      default:
        // For standard inputs
        const standardInput = container.querySelector('input, select, textarea');
        const standardValue = standardInput ? standardInput.value : '';
        console.log(`${type} field "${name}" value:`, standardValue);
        return standardValue;
    }
  }

  updateNextButtonState(isValid, emptyRequiredFields) {
    if (this.currentPage < this.totalPages - 1) {
      this.nextPageBtnTarget.disabled = !isValid;
      
      // Add visual indicator for validation state
      if (isValid) {
        this.nextPageBtnTarget.classList.remove('opacity-50', 'cursor-not-allowed');
        this.hideValidationMessage();
      } else {
        this.nextPageBtnTarget.classList.add('opacity-50', 'cursor-not-allowed');
        // Only show validation message if user has interacted
        if (this.hasUserInteracted) {
          this.showValidationMessage(emptyRequiredFields);
        }
      }
    }
  }

  // Method to update button state without showing validation messages
  updateNextButtonStateOnly(isValid) {
    if (this.currentPage < this.totalPages - 1) {
      this.nextPageBtnTarget.disabled = !isValid;
      
      // Add visual indicator for validation state
      if (isValid) {
        this.nextPageBtnTarget.classList.remove('opacity-50', 'cursor-not-allowed');
      } else {
        this.nextPageBtnTarget.classList.add('opacity-50', 'cursor-not-allowed');
      }
    }
  }

  showValidationMessage(emptyRequiredFields) {
    // Remove existing validation message
    this.hideValidationMessage();
    
    // Create validation message
    const message = document.createElement('div');
    message.id = 'validation-message';
    message.className = 'validation-message fixed top-4 right-4 bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg z-50 max-w-sm';
    
    const fieldNames = emptyRequiredFields.map(field => field.name || 'Unknown field').join(', ');
    message.innerHTML = `
      <div class="flex items-start">
        <svg class="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <div>
          <div class="font-semibold">Please fill required fields</div>
          <div class="text-sm mt-1">Complete all required fields before proceeding to the next page.</div>
        </div>
      </div>
    `;
    
    document.body.appendChild(message);
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      this.hideValidationMessage();
    }, 5000);
  }

  hideValidationMessage() {
    const existingMessage = document.getElementById('validation-message');
    if (existingMessage) {
      existingMessage.remove();
    }
  }

  nextPage() {
    // Mark that user has interacted when trying to navigate
    this.hasUserInteracted = true;
    
    // Validate current page before proceeding
    if (!this.validateCurrentPage()) {
      return; // Don't proceed if validation fails
    }

    if (this.currentPage < this.totalPages - 1) {
      this.currentPage++;
      this.showCurrentPage();
      this.updateButtonStates();
      this.updateProgress();
      this.notifyPageChange();
      
      // Reset interaction flag for new page
      this.hasUserInteracted = false;
      
      // Validate the new page for button state immediately, then for messages after delay
      setTimeout(() => {
        this.validateCurrentPageForButtonState();
      }, 100);
    }
  }

  backPage() {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.showCurrentPage();
      this.updateButtonStates();
      this.updateProgress();
      this.notifyPageChange();
      
      // Reset interaction flag for new page
      this.hasUserInteracted = false;
      
      // Validate the new page for button state immediately
      setTimeout(() => {
        this.validateCurrentPageForButtonState();
      }, 100);
    }
  }

  showCurrentPage() {
    this.pageContentTargets.forEach((page, index) => {
      page.classList.toggle("hidden", index !== this.currentPage);
    });
  }

  updateButtonStates() {
    this.backPageBtnTarget.disabled = this.currentPage === 0;
    
    // Don't disable next button here - let validation handle it
    const isLastPage = this.currentPage === this.totalPages - 1;

    if (isLastPage) {
      this.nextPageBtnTarget.classList.add("hidden");
      this.submitFormBtnTarget.classList.remove("hidden");
    } else {
      this.nextPageBtnTarget.classList.remove("hidden");
      this.submitFormBtnTarget.classList.add("hidden");
    }

    // Ensure submit button is hidden if there are no pages or only one page from the start
    if (this.totalPages <= 1) {
      this.nextPageBtnTarget.classList.add("hidden");
      this.submitFormBtnTarget.classList.remove("hidden");
      this.backPageBtnTarget.disabled = true;
    }
    
    // Re-validate after button state changes
    setTimeout(() => {
      this.validateCurrentPage();
    }, 50);
  }

  // Update progress bar
  updateProgress() {
    const progressBar = document.getElementById("progress-bar");
    const pageIndicator = document.getElementById("page-indicator");

    if (progressBar && pageIndicator) {
      const progressPercentage =
        ((this.currentPage + 1) / this.totalPages) * 100;
      progressBar.style.width = progressPercentage + "%";
      pageIndicator.textContent =
        "Page " + (this.currentPage + 1) + " of " + this.totalPages;
    }
  }

  notifyPageChange() {
    // Dispatch custom event
    const event = new CustomEvent('pageChanged', {
      bubbles: true,
      detail: { source: 'pagination' }
    });
    
    this.element.dispatchEvent(event);
  }
}
