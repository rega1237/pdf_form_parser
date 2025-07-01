import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  // Se elimina "submitFormBtn" de los targets
  static targets = [
    "pageContent",
    "backPageBtn",
    "nextPageBtn",
  ];

  connect() {
    this.currentPage = 0;
    this.totalPages = this.pageContentTargets.length;
    this.updateButtonStates();
    this.showCurrentPage();
    this.updateProgress();
    this.setupFieldValidation();
    
    this.hasUserInteracted = false;
    this.validationTimeout = null;
    
    // Validación inicial para establecer el estado correcto del botón
    setTimeout(() => {
      this.validateCurrentPageForButtonState();
    }, 100);
  }

  setupFieldValidation() {
    // Agrega event listeners a todos los inputs para validación en tiempo real
    this.pageContentTargets.forEach((page, pageIndex) => {
      const inputs = page.querySelectorAll('input, select, textarea');
      inputs.forEach(input => {
        input.addEventListener('focus', () => { this.hasUserInteracted = true; });
        input.addEventListener('input', () => { this.hasUserInteracted = true; this.debounceValidation(); });
        input.addEventListener('change', () => { this.hasUserInteracted = true; this.debounceValidation(); });
      });

      const choiceButtons = page.querySelectorAll('.choice-button, .radio-choice-button');
      choiceButtons.forEach(button => {
        button.addEventListener('click', () => {
          this.hasUserInteracted = true;
          setTimeout(() => this.validateCurrentPage(), 100);
        });
      });

      const checkboxButtons = page.querySelectorAll('.checkbox-button input[type="checkbox"]');
      checkboxButtons.forEach(checkbox => {
        checkbox.addEventListener('change', () => { this.hasUserInteracted = true; this.debounceValidation(); });
      });
    });
  }

  debounceValidation() {
    clearTimeout(this.validationTimeout);
    this.validationTimeout = setTimeout(() => { this.validateCurrentPage(); }, 300);
  }

  validateCurrentPage() {
    const currentPageElement = this.pageContentTargets[this.currentPage];
    if (!currentPageElement) return true;

    const requiredFields = this.getRequiredFieldsOnPage(currentPageElement);
    const emptyRequiredFields = requiredFields.filter(field => {
      const fieldValue = this.getFieldValue(field);
      return !fieldValue || fieldValue.trim() === '';
    });

    const isValid = emptyRequiredFields.length === 0;
    this.updateNextButtonState(isValid, emptyRequiredFields);
    
    return isValid;
  }
  
  validateCurrentPageForButtonState() {
    const currentPageElement = this.pageContentTargets[this.currentPage];
    if (!currentPageElement) return true;

    const requiredFields = this.getRequiredFieldsOnPage(currentPageElement);
    const emptyRequiredFields = requiredFields.filter(field => {
        const fieldValue = this.getFieldValue(field);
        return !fieldValue || fieldValue.trim() === '';
    });

    const isValid = emptyRequiredFields.length === 0;
    this.updateNextButtonStateOnly(isValid);
    
    return isValid;
  }

  getRequiredFieldsOnPage(pageElement) {
    return Array.from(pageElement.querySelectorAll('[data-required="true"]'));
  }

  getFieldName(fieldContainer) {
    return fieldContainer.dataset.fieldName || '';
  }

  getFieldValue(fieldContainer) {
    const fieldType = fieldContainer.dataset.fieldType;
    
    switch (fieldType) {
      case 'Pass/Fail':
      case 'Radio':
        const hiddenInput = fieldContainer.querySelector('input[type="hidden"]');
        return hiddenInput ? hiddenInput.value : '';
      
      case 'Photo':
        const fileInput = fieldContainer.querySelector('input[type="file"]');
        const previewContainer = fieldContainer.querySelector('[data-photo-capture-target="preview"]');
        const hasExistingPhoto = previewContainer && !previewContainer.classList.contains('hidden');
        return (fileInput && fileInput.files.length > 0) || hasExistingPhoto ? 'photo' : '';
      
      case 'Deficiency':
        const riserInput = fieldContainer.querySelector('input[type="number"]');
        const selectInput = fieldContainer.querySelector('select');
        return (riserInput?.value && selectInput?.value) ? `${riserInput.value}_${selectInput.value}` : '';
      
      case 'Button':
        const checkbox = fieldContainer.querySelector('input[type="checkbox"]');
        return checkbox && checkbox.checked ? 'checked' : '';
      
      default:
        const standardInput = fieldContainer.querySelector('input, select, textarea');
        return standardInput ? standardInput.value : '';
    }
  }

  updateNextButtonState(isValid, emptyRequiredFields) {
    if (this.currentPage < this.totalPages - 1) {
      this.nextPageBtnTarget.disabled = !isValid;
      if (!isValid && this.hasUserInteracted) {
        this.showValidationMessage(emptyRequiredFields);
      } else {
        this.hideValidationMessage();
      }
    }
  }
  
  updateNextButtonStateOnly(isValid) {
    if (this.currentPage < this.totalPages - 1) {
      this.nextPageBtnTarget.disabled = !isValid;
    }
  }

  showValidationMessage(emptyRequiredFields) {
    this.hideValidationMessage();
    const message = document.createElement('div');
    message.id = 'validation-message';
    message.className = 'validation-message fixed top-4 right-4 bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg z-50 max-w-sm';
    message.innerHTML = `<div class="font-semibold">Please fill all required fields to continue.</div>`;
    document.body.appendChild(message);
    setTimeout(() => this.hideValidationMessage(), 5000);
  }

  hideValidationMessage() {
    const existingMessage = document.getElementById('validation-message');
    if (existingMessage) {
      existingMessage.remove();
    }
  }

  nextPage() {
    this.hasUserInteracted = true;
    if (!this.validateCurrentPage()) {
      return;
    }

    if (this.currentPage < this.totalPages - 1) {
      this.currentPage++;
      this.showCurrentPage();
      this.updateButtonStates();
      this.updateProgress();
      this.notifyPageChange();
      this.hasUserInteracted = false;
      setTimeout(() => this.validateCurrentPageForButtonState(), 100);
    }
  }

  backPage() {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.showCurrentPage();
      this.updateButtonStates();
      this.updateProgress();
      this.notifyPageChange();
      this.hasUserInteracted = false;
      setTimeout(() => this.validateCurrentPageForButtonState(), 100);
    }
  }

  showCurrentPage() {
    this.pageContentTargets.forEach((page, index) => {
      page.classList.toggle("hidden", index !== this.currentPage);
    });
  }

  updateButtonStates() {
    this.backPageBtnTarget.disabled = this.currentPage === 0;
    
    const isLastPage = this.currentPage === this.totalPages - 1;
    this.nextPageBtnTarget.disabled = isLastPage;

    if (!isLastPage) {
      this.validateCurrentPage();
    }
  }

  updateProgress() {
    const progressBar = document.getElementById("progress-bar");
    const pageIndicator = document.getElementById("page-indicator");
    if (progressBar && pageIndicator) {
      const progressPercentage = ((this.currentPage + 1) / this.totalPages) * 100;
      progressBar.style.width = progressPercentage + "%";
      pageIndicator.textContent = "Page " + (this.currentPage + 1) + " of " + this.totalPages;
    }
  }

  notifyPageChange() {
    const event = new CustomEvent('pageChanged', { bubbles: true, detail: { source: 'pagination' } });
    this.element.dispatchEvent(event);
  }
}