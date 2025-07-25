import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = [
    "pageContent",
    "backPageBtn",
    "nextPageBtn",
  ];

  connect() {
    this.currentPage = 0;
    this.totalPages = this.pageContentTargets.length;
    this.showCurrentPage();
    this.updateButtonStates();
    this.updateProgress();
    this.setupFieldValidation();
  }

  setupFieldValidation() {
    this.pageContentTargets.forEach((page) => {
      const inputs = page.querySelectorAll('input, select, textarea');
      inputs.forEach(input => {
        input.addEventListener('input', () => { this.debounceValidation(); });
        input.addEventListener('change', () => { this.debounceValidation(); });
      });

      const choiceButtons = page.querySelectorAll('.choice-button, .radio-choice-button');
      choiceButtons.forEach(button => {
        button.addEventListener('click', () => {
          setTimeout(() => this.validateCurrentPage(), 100);
        });
      });
    });
  }

  debounceValidation() {
    clearTimeout(this.validationTimeout);
    this.validationTimeout = setTimeout(() => { this.validateCurrentPage(); }, 300);
  }

  nextPage(event) {
    if (this.nextPageBtnTarget.classList.contains('is-disabled')) {
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
    const emptyRequiredFields = requiredFields.filter(field => {
      const fieldValue = this.getFieldValue(field);
      return !fieldValue || fieldValue.trim() === '';
    });

    const isValid = emptyRequiredFields.length === 0;

    this.nextPageBtnTarget.classList.toggle('is-disabled', !isValid);
  }

  changeToNextPage() {
    let pageIncrement = 1;
    const currentPageElement = this.pageContentTargets[this.currentPage];
    const skipTriggerElement = currentPageElement.querySelector('[data-pagination-skip-trigger="true"]');

    if (skipTriggerElement) {
      const fieldContainer = skipTriggerElement.closest('[data-field-type="Pass/Fail"]');
      if (fieldContainer) {
        const value = this.getFieldValue(fieldContainer);
        if (value === 'Pass' || value === 'N/A') {
          pageIncrement = 2;
        }
      }
    }

    if (this.currentPage < this.totalPages - 1) {
      this.currentPage = Math.min(this.currentPage + pageIncrement, this.totalPages - 1);
      this.showCurrentPage();
      this.updateButtonStates();
      this.updateProgress();
      this.notifyPageChange();
    }
  }

  showValidationMessage() {
    this.hideValidationMessage();
    const message = document.createElement('div');
    message.id = 'validation-message';
    message.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg z-50 max-w-sm animate-fade-in';
    message.innerHTML = `<div class="font-semibold">Please fill all required fields to continue.</div>`;
    document.body.appendChild(message);
    setTimeout(() => this.hideValidationMessage(), 3000);
  }
  
  hideValidationMessage() {
    const existingMessage = document.getElementById('validation-message');
    if (existingMessage) {
      existingMessage.remove();
    }
  }

  getRequiredFieldsOnPage(pageElement) {
    return Array.from(pageElement.querySelectorAll('[data-required="true"]'));
  }

  getFieldValue(fieldContainer) {
    const fieldType = fieldContainer.dataset.fieldType;
    switch (fieldType) {
      case 'Pass/Fail':
      case 'Radio':
        return fieldContainer.querySelector('input[type="hidden"]')?.value || '';
      case 'Photo':
        const fileInput = fieldContainer.querySelector('input[type="file"]');
        const previewContainer = fieldContainer.querySelector('[data-photo-capture-target="preview"]');
        const hasExistingPhoto = previewContainer && !previewContainer.classList.contains('hidden');
        return (fileInput?.files.length > 0) || hasExistingPhoto ? 'photo_present' : '';
      case 'Deficiency':
        const riserInput = fieldContainer.querySelector('input[type="number"]');
        const selectInput = fieldContainer.querySelector('select');
        return (riserInput?.value && selectInput?.value) ? `${riserInput.value}_${selectInput.value}` : '';
      case 'Button':
        return fieldContainer.querySelector('input[type="checkbox"]')?.checked ? 'checked' : '';
      default:
        return fieldContainer.querySelector('input, select, textarea')?.value || '';
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
      const progressPercentage = ((this.currentPage + 1) / this.totalPages) * 100;
      progressBar.style.width = `${progressPercentage}%`;
      pageIndicator.textContent = `Page ${this.currentPage + 1} of ${this.totalPages}`;
    }
  }

  notifyPageChange() {
    const event = new CustomEvent('pageChanged', { bubbles: true, detail: { source: 'pagination' } });
    this.element.dispatchEvent(event);
  }
}