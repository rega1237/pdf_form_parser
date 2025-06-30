// app/javascript/controllers/field_toggle_controller.js
import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  connect() {
    console.log("Field toggle controller connected");
    this.setupPolling();
  }

  disconnect() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
  }

  setupPolling() {
    // Revisar cada 500ms si hay una nueva página visible
    this.currentPageNumber = null;
    this.isExpanded = false;
    
    this.pollingInterval = setInterval(() => {
      this.checkForPageChange();
    }, 500);
    
    // Configuración inicial
    setTimeout(() => this.checkForPageChange(), 100);
  }

  checkForPageChange() {
    const currentPage = this.element.querySelector('.page-content:not(.hidden)');
    
    if (currentPage) {
      const pageNumber = currentPage.dataset.pageNumber;
      
      // Si es una página diferente, configurar el toggle
      if (pageNumber !== this.currentPageNumber) {
        this.currentPageNumber = pageNumber;
        this.setupToggleForCurrentPage(currentPage);
      }
    }
  }

  setupToggleForCurrentPage(page) { 
    // Buscar elementos del toggle en la página actual
    const toggleButton = page.querySelector('[data-field-toggle-target="toggleButton"]');
    const toggleIcon = page.querySelector('[data-field-toggle-target="toggleIcon"]');
    const toggleText = page.querySelector('[data-field-toggle-target="toggleText"]');
    const additionalFields = page.querySelector('[data-field-toggle-target="additionalFields"]');

    if (toggleButton && additionalFields) {
      // Guardar referencias para usar en toggleFields
      this.currentToggleButton = toggleButton;
      this.currentToggleIcon = toggleIcon;
      this.currentToggleText = toggleText;
      this.currentAdditionalFields = additionalFields;
      
      // Resetear estado para la nueva página
      this.isExpanded = false;
      additionalFields.classList.remove('show');
      if (toggleIcon) toggleIcon.classList.remove('rotated');
      toggleButton.classList.remove('expanded');
      
      // Remover animaciones previas
      const fieldContainers = additionalFields.querySelectorAll('.grid > div');
      fieldContainers.forEach(field => {
        field.classList.remove('field-appear');
      });
      
      // Actualizar texto del botón
      this.updateButtonText(page, toggleText);
    }
  }

  // Método llamado por Stimulus cuando se hace click en el botón
  toggleFields(event) {
    // Si no tenemos referencias guardadas, buscarlas
    if (!this.currentToggleButton || !this.currentAdditionalFields) {
      const currentPage = this.element.querySelector('.page-content:not(.hidden)');
      if (currentPage) {
        this.setupToggleForCurrentPage(currentPage);
      }
    }
    
    // Verificar que tenemos todos los elementos necesarios
    if (!this.currentToggleButton || !this.currentAdditionalFields) {
      console.error('❌ No se encontraron elementos del toggle');
      return;
    }
    
    this.performToggle();
  }

  // Método interno que realiza el toggle
  performToggle() {
    this.isExpanded = !this.isExpanded;
 
    const toggleButton = this.currentToggleButton;
    const toggleIcon = this.currentToggleIcon;
    const toggleText = this.currentToggleText;
    const additionalFields = this.currentAdditionalFields;
    
    if (this.isExpanded) {
      // Mostrar campos
      additionalFields.classList.add('show');
      if (toggleIcon) toggleIcon.classList.add('rotated');
      toggleButton.classList.add('expanded');
      
      // Actualizar texto
      let buttonText = toggleText.textContent;
      let textCountMatch = buttonText.match(/\((\d+)\)/);
      let textCount = textCountMatch ? textCountMatch[1] : '';
      toggleText.textContent = `Hide Aditional Fields ${textCount ? ` (${textCount})` : ''}`;
      
      // Animar campos
      setTimeout(() => {
        const containers = additionalFields.querySelectorAll('.grid > div');
        containers.forEach((field, index) => {
          setTimeout(() => {
            field.classList.add('field-appear');
          }, index * 100);
        });
      }, 150);
      
    } else {
      // Ocultar campos
      additionalFields.classList.remove('show');
      if (toggleIcon) toggleIcon.classList.remove('rotated');
      toggleButton.classList.remove('expanded');
      
      // Actualizar texto
      let buttonText = toggleText.textContent;
      let textCountMatch = buttonText.match(/\((\d+)\)/);
      let textCount = textCountMatch ? textCountMatch[1] : '';
      toggleText.textContent = `Show Aditional Fields${textCount ? ` (${textCount})` : ''}`;
      
      // Remover animaciones
      const containers = additionalFields.querySelectorAll('.grid > div');
      containers.forEach(field => {
        field.classList.remove('field-appear');
      });
    }
  }

  updateButtonText(page, toggleText) {
    if (!toggleText) return;
    
    // Contar campos adicionales
    const hiddenFields = page.querySelectorAll('[data-field-type]:not([data-field-type="Pass/Fail"]):not([data-field-type="Photo"]):not([data-field-type="Deficiency"])');
    const fieldCount = hiddenFields.length;
    
    let baseText = this.isExpanded ? 'Hide' : 'Show';
    let countText = fieldCount > 0 ? ` (${fieldCount})` : '';
    toggleText.textContent = `${baseText} Aditional Fields ${countText}`;
  }
}