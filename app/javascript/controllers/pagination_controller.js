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
    this.updateButtonStates();
    this.showCurrentPage();
    this.updateProgress();
    this.setupFieldValidation();

    this.hasUserInteracted = false;
    this.validationTimeout = null;

    setTimeout(() => {
      this.validateCurrentPageForButtonState();
    }, 100);
  }

  setupFieldValidation() {
    this.pageContentTargets.forEach((page) => {
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
        return (fileInput && fileInput.files.length > 0) || hasExistingPhoto ? 'photo_present' : '';
      
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
        this.showValidationMessage();
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

  showValidationMessage() {
    this.hideValidationMessage();
    const message = document.createElement('div');
    message.id = 'validation-message';
    message.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg z-50 max-w-sm';
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

  /**
   * MÉTODO MODIFICADO: Contiene la nueva lógica de salto de página.
   */
  nextPage() {
    this.hasUserInteracted = true;
    if (!this.validateCurrentPage()) {
      return;
    }

    // --- NUEVA LÓGICA DE SALTO ---
    let pageIncrement = 1; // Por defecto, avanza 1 página.
    const currentPageElement = this.pageContentTargets[this.currentPage];
    
    // Buscamos si en la página actual existe el campo que dispara el salto.
    const skipTriggerElement = currentPageElement.querySelector('[data-pagination-skip-trigger="true"]');

    if (skipTriggerElement) {
      // Si existe, buscamos su contenedor principal para obtener el tipo y el valor.
      const fieldContainer = skipTriggerElement.closest('[data-field-type="Pass/Fail"]');
      if (fieldContainer) {
        const value = this.getFieldValue(fieldContainer);
        // Si el valor es "Pass" o "N/A", cambiamos el incremento a 3.
        if (value === 'Pass' || value === 'N/A') {
          pageIncrement = 3;
        }
      }
    }
    // --- FIN DE LA NUEVA LÓGICA ---

    // Nos aseguramos de poder avanzar.
    if (this.currentPage < this.totalPages - 1) {
      // Usamos el pageIncrement y nos aseguramos de no pasarnos de la última página.
      this.currentPage = Math.min(this.currentPage + pageIncrement, this.totalPages - 1);
      
      // Actualizamos la vista.
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