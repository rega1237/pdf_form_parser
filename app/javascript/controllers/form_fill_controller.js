import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["formStructure"];

  connect() {
    // Initialize change tracking for incremental updates
    this.changedFields = new Map();
    this.debouncedSave = this.debounce(
      this.saveDraftIncremental.bind(this),
      3000,
    );

    // Sincronizar la estructura de fotos al conectar para asegurar consistencia
    this.syncPhotoStructure();

    // Agregar event listener para recargar valores del formulario
    this.element.addEventListener(
      "reload-form-values",
      this.handleReloadFormValues.bind(this),
    );

    // Set up field change tracking for incremental saves
    this.setupFieldChangeTracking();
    
    // Set up Pass/Fail field tracking
    this.setupPassFailTracking();
  }


  // Setup tracking for Pass/Fail fields
  setupPassFailTracking() {
    // Find all Pass/Fail hidden inputs
    const passFailInputs = this.element.querySelectorAll('input[type="hidden"][id^="hidden_input_"]');
    
    passFailInputs.forEach(hiddenInput => {
      // Create a MutationObserver to watch for value changes
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'value') {
            this.handlePassFailChange(hiddenInput);
          }
        });
      });
      
      // Start observing
      observer.observe(hiddenInput, {
        attributes: true,
        attributeFilter: ['value']
      });
      
      // Also listen for direct value property changes
      const originalValue = hiddenInput.value;
      Object.defineProperty(hiddenInput, 'value', {
        get() {
          return this.getAttribute('value') || '';
        },
        set(newValue) {
          if (this.getAttribute('value') !== newValue) {
            this.setAttribute('value', newValue);
            // Trigger our change handler
            setTimeout(() => {
              const event = new Event('passfail-change', { bubbles: true });
              this.dispatchEvent(event);
            }, 0);
          }
        }
      });
      
      // Listen for the custom event
      hiddenInput.addEventListener('passfail-change', () => {
        this.handlePassFailChange(hiddenInput);
      });
    });
    
    // Also listen for choice-buttons events (if they dispatch custom events)
    this.element.addEventListener('choice-selected', (event) => {
      const hiddenInput = event.target.querySelector('input[type="hidden"]');
      if (hiddenInput) {
        this.handlePassFailChange(hiddenInput);
      }
    });
  }

  // Handle Pass/Fail field changes
  handlePassFailChange(hiddenInput) {
    const fieldName = this.extractFieldNameFromHidden(hiddenInput);
    
    if (fieldName) {
      const fieldValue = hiddenInput.value || '';
      const currentValue = this.changedFields.get(fieldName);
      
      console.log(`Pass/Fail change detected - Field: ${fieldName}, Value: ${fieldValue}`);
      
      // Only track if value actually changed
      if (currentValue !== fieldValue) {
        this.changedFields.set(fieldName, fieldValue);
        
        // Trigger debounced save
        this.debouncedSave();
        
        // Trigger validation update for pagination
        this.updateFieldValidation(fieldName, fieldValue);
      }
    }
  }

  // Extract field name from hidden input
  extractFieldNameFromHidden(hiddenInput) {
    // Pattern: hidden_input_form_data_fieldname_...
    const id = hiddenInput.id;
    if (id.startsWith('hidden_input_')) {
      // Try to find the corresponding form field
      const choiceButtonGroup = hiddenInput.closest('[data-controller*="choice-buttons"]');
      if (choiceButtonGroup) {
        const hiddenInputId = choiceButtonGroup.dataset.hiddenInputId;
        if (hiddenInputId) {
          // Extract field name from the hidden input ID
          const match = hiddenInputId.match(/hidden_input_(.+)/);
          if (match) {
            // Convert back to form field name format
            return match[1].replace(/^form_data_/, '').replace(/_[^_]+$/, '');
          }
        }
      }
    }
    return null;
  }

  // Update field validation status
  updateFieldValidation(fieldName, fieldValue) {
    // Find the field container
    const fieldContainer = this.element.querySelector(`[data-field-name="${fieldName}"]`);
    if (fieldContainer) {
      const isRequired = fieldContainer.dataset.required === 'true';
      const hasValue = fieldValue && fieldValue.trim() !== '';
      
      // Update validation state
      if (isRequired) {
        fieldContainer.classList.toggle('field-valid', hasValue);
        fieldContainer.classList.toggle('field-invalid', !hasValue);
      }
      
      // Trigger pagination validation update
      const event = new CustomEvent('field-validation-changed', {
        bubbles: true,
        detail: { fieldName, hasValue, isRequired }
      });
      this.element.dispatchEvent(event);
    }
  }

  // Método para sincronizar la estructura del formulario con fotos existentes
  async syncPhotoStructure() {
    try {
      const formId = this.element.action.split("/").pop().split("?")[0];
      const response = await fetch(`/form_fills/${formId}/structure`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": this.csrfToken,
        },
      });

      if (response.ok) {
        const data = await response.json();
        this.element.dataset.formFillFormStructureValue = data.form_structure;

        const hiddenInput = document.getElementById("form_fill_form_structure");
        if (hiddenInput) {
          hiddenInput.value = data.form_structure;
        }

        this.loadFormValues();
      }
    } catch (error) {
      console.error("Error syncing photo structure:", error);
    }
  }

  disconnect() {
    // Limpiar event listeners al desconectar
    this.element.removeEventListener(
      "reload-form-values",
      this.handleReloadFormValues.bind(this),
    );
  }

  // Método para manejar el evento de recarga de valores del formulario
  handleReloadFormValues(event) {
    this.loadFormValues();
  }

  loadFormValues() {
    console.log("Loading form values...");
    
    // First, get data from the data column
    const dataFromColumn = this.getDataFromColumn();
    console.log("Data from column:", dataFromColumn);
    
    const formStructureData = JSON.parse(
      this.element.dataset.formFillFormStructureValue || "[]",
    );
    const formElements = this.element.elements;

    formStructureData.forEach((field) => {
      if (field.name) {
        // For Pass/Fail fields, prioritize data from column over structure
        if (field.type === "Pass/Fail") {
          const valueFromData = dataFromColumn[field.name];
          const finalValue = valueFromData || field.value;
          
          if (finalValue) {
            this.loadPassFailField(field.name, finalValue);
          }
        } else {
          // Handle other field types normally
          const inputElement = formElements[`form_fill[${field.name}]`];

          if (inputElement) {
            if (inputElement.type === "file") {
              if (field.photo_attachment_id) {
                this.displayExistingPhoto(inputElement, field);
              }
            } else if (
              inputElement.type === "checkbox" ||
              inputElement.type === "radio"
            ) {
              inputElement.checked =
                field.value === inputElement.value ||
                field.value === true ||
                field.value === "true";
            } else {
              inputElement.value = field.value || "";
            }
          }
        }

        if (field.type === "Deficiency") {
          // Load the searchable-select dropdown value
          const selectElement = formElements[`form_fill[${field.name}_select]`];
          if (selectElement) {
            selectElement.value = field.select || field.value || "";
          }
          
          // Also update the searchable-select display if it exists
          const searchableSelectContainer = this.element.querySelector(`[data-controller*="searchable-select"] input[id*="${field.name}_select"]`)?.closest('[data-controller*="searchable-select"]');
          if (searchableSelectContainer && (field.select || field.value)) {
            // Update the display text of the searchable select
            const buttonText = searchableSelectContainer.querySelector('[data-searchable-select-target="buttonText"]');
            if (buttonText) {
              buttonText.textContent = field.select || field.value || "Select an option";
            }
          }
          
          const commentElement = formElements[`form_fill[${field.name}_comment]`];
          if (commentElement) {
            commentElement.value = field.comment_value || "";
          }
          const itemElement = formElements[`form_fill[${field.name}_item]`];
          if (itemElement) {
            itemElement.value = field.Item || "";
          }
          const riserElement = formElements[`form_fill[${field.name}_riser]`];
          if (riserElement) {
            riserElement.value = field.Riser || "";
          }
          const cElement = formElements[`${field.name}_c`];
          if (cElement) {
            cElement.checked = field.C === "Yes" || field.C === true;
          }
          const dElement = formElements[`${field.name}_d`];
          if (dElement) {
            dElement.checked = field.D === "Yes" || field.D === true;
          }
        }
      }
    });
  }

  // Get data from the data column
  getDataFromColumn() {
    try {
      console.log("Getting data from column...");
      
      // Try to get data from Rails via a global variable or data attribute
      if (window.formFillData) {
        console.log("Using window.formFillData:", window.formFillData);
        return window.formFillData;
      }
      
      // Try to get from form element data attribute
      const dataValue = this.element.dataset.formFillDataValue;
      if (dataValue) {
        console.log("Found data value attribute:", dataValue);
        const parsedData = JSON.parse(dataValue);
        console.log("Parsed data:", parsedData);
        return parsedData;
      }
      
      console.log("No data found in attributes");
      return {};
      
    } catch (error) {
      console.error("Error getting data from column:", error);
      return {};
    }
  }

  // Fetch data from server (async version)
  async fetchDataFromServer(formId) {
    try {
      const response = await fetch(`/form_fills/${formId}/get_current_data`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": this.csrfToken,
        },
      });
      
      if (response.ok) {
        const result = await response.json();
        return result.data || {};
      } else {
        console.error("Failed to fetch current data");
        return {};
      }
    } catch (error) {
      console.error("Error fetching data from server:", error);
      return {};
    }
  }

  // Load Pass/Fail field specifically
  loadPassFailField(fieldName, value) {
    // Find the hidden input for this field
    let hiddenInput = null;
    
    // Method 1: Look for hidden input by field name pattern
    const possibleSelectors = [
      `input[type="hidden"][id*="${fieldName}"]`,
      `input[type="hidden"][name*="${fieldName}"]`,
      `#hidden_input_form_data_${fieldName}`,
      `#hidden_input_${fieldName}`,
      `input[type="hidden"][id^="hidden_input"][id*="${fieldName}"]`
    ];
    
    for (const selector of possibleSelectors) {
      hiddenInput = this.element.querySelector(selector);
      if (hiddenInput) {
        break;
      }
    }
    
    // Method 2: Find by looking for the field container first
    if (!hiddenInput) {
      const fieldContainer = this.element.querySelector(`[data-field-name="${fieldName}"]`);
      if (fieldContainer) {
        hiddenInput = fieldContainer.querySelector('input[type="hidden"]');
      }
    }
    
    // Method 3: Find by choice-button-group and data attribute
    if (!hiddenInput) {
      const choiceGroups = this.element.querySelectorAll('[data-controller*="choice-buttons"]');
      choiceGroups.forEach(group => {
        const hiddenInputId = group.dataset.hiddenInputId;
        if (hiddenInputId && hiddenInputId.includes(fieldName)) {
          hiddenInput = document.getElementById(hiddenInputId);
        }
      });
    }
    
    if (hiddenInput) {
      // Update the hidden input value
      hiddenInput.value = value;
      
      // Find the choice button group
      const choiceButtonGroup = hiddenInput.closest('[data-controller*="choice-buttons"]') || 
                                hiddenInput.parentElement.closest('[data-controller*="choice-buttons"]') ||
                                this.element.querySelector(`[data-hidden-input-id="${hiddenInput.id}"]`);
      
      if (choiceButtonGroup) {
        // Find all buttons in this group
        const buttons = choiceButtonGroup.querySelectorAll('.choice-button, .radio-choice-button');
        
        buttons.forEach(button => {
          const buttonValue = button.dataset.value;
          const isSelected = buttonValue === value;
          
          if (isSelected) {
            // Select this button
            if (button.classList.contains('radio-choice-button')) {
              this.selectRadioButton(button);
            } else {
              // Handle regular choice-button
              button.classList.add('selected');
            }
          } else {
            // Deselect this button
            if (button.classList.contains('radio-choice-button')) {
              this.deselectRadioButton(button);
            } else {
              // Handle regular choice-button
              button.classList.remove('selected');
            }
          }
        });
        
        // Force trigger the choice-buttons controller to update
        setTimeout(() => {
          const choiceController = this.getChoiceButtonsController(choiceButtonGroup);
          if (choiceController && choiceController.preselectButton) {
            choiceController.preselectButton();
          }
        }, 200); // Increased timeout to ensure DOM is ready
        
      }
      
      // Trigger validation
      this.updateFieldValidation(fieldName, value);
    }
  }

  // Get choice-buttons controller instance
  getChoiceButtonsController(element) {
    try {
      if (this.application) {
        return this.application.getControllerForElementAndIdentifier(element, "choice-buttons");
      }
      return null;
    } catch (error) {
      console.error("Error getting choice-buttons controller:", error);
      return null;
    }
  }

  // Select radio button (duplicate from choice-buttons for consistency)
  selectRadioButton(button) {
    // Remover clases de estado no seleccionado
    button.classList.remove(
      'from-slate-100', 'to-slate-200', 'border-slate-400', 'text-slate-900',
      'hover:from-slate-200', 'hover:to-slate-300', 'hover:border-slate-500', 
      'hover:-translate-y-0.5', 'hover:shadow-lg'
    );
    
    // Agregar clases de estado seleccionado
    button.classList.add(
      'from-blue-600', 'to-blue-700', 'border-blue-900', 'text-white', 'shadow-xl'
    );

    // Actualizar el indicador del círculo interno
    const radioIndicator = button.querySelector('.radio-indicator div');
    if (radioIndicator) {
      radioIndicator.classList.remove('opacity-0');
      radioIndicator.classList.add('opacity-100');
    }

    // Actualizar data-selected attribute
    button.dataset.selected = 'true';
  }

  // Deselect radio button (duplicate from choice-buttons for consistency)
  deselectRadioButton(button) {
    // Remover clases de estado seleccionado
    button.classList.remove(
      'from-blue-600', 'to-blue-700', 'border-blue-900', 'text-white', 'shadow-xl'
    );
    
    // Agregar clases de estado no seleccionado
    button.classList.add(
      'from-slate-100', 'to-slate-200', 'border-slate-400', 'text-slate-900',
      'hover:from-slate-200', 'hover:to-slate-300', 'hover:border-slate-500', 
      'hover:-translate-y-0.5', 'hover:shadow-lg'
    );

    // Actualizar el indicador del círculo interno
    const radioIndicator = button.querySelector('.radio-indicator div');
    if (radioIndicator) {
      radioIndicator.classList.remove('opacity-100');
      radioIndicator.classList.add('opacity-0');
    }

    // Actualizar data-selected attribute
    button.dataset.selected = 'false';
  }

  displayExistingPhoto(fileInput, fieldData) {
    const fieldId = fileInput.id;
    const previewContainer = document.getElementById(
      `photo-preview-${fieldId}`,
    );

    if (previewContainer && fieldData.photo_attachment_id) {
      const imageElement = previewContainer.querySelector(
        '[data-photo-capture-target="image"]',
      );

      if (
        imageElement &&
        imageElement.src &&
        imageElement.src !== window.location.href
      ) {
        previewContainer.classList.remove("hidden");
      } else {
        this.fetchPhotoUrl(fieldData.name, fieldData.photo_attachment_id).then(
          (photoUrl) => {
            if (photoUrl && imageElement) {
              imageElement.src = photoUrl;
              previewContainer.classList.remove("hidden");
              this.updatePhotoPreviewToSavedState(
                previewContainer,
                fieldData.name,
              );
            } else {
              this.tryAlternativePhotoLoad(
                fieldData,
                previewContainer,
                imageElement,
              );
            }
          },
        );
      }
    }
  }

  async fetchPhotoUrl(fieldName, attachmentId) {
    try {
      const formId = this.element.action.split("/").pop().split("?")[0];
      const response = await fetch(`/form_fills/${formId}/photo_url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": this.csrfToken,
        },
        body: JSON.stringify({
          field_name: fieldName,
          attachment_id: attachmentId,
        }),
      });
      const data = await response.json();
      return data.photo_url;
    } catch (error) {
      console.error("Error fetching photo URL:", error);
      return null;
    }
  }

  get csrfToken() {
    return document.querySelector('meta[name="csrf-token"]').content;
  }

  // Set up field change tracking for incremental saves
  setupFieldChangeTracking() {
    const formElements = this.element.elements;

    Array.from(formElements).forEach((element) => {
      if (element.name && element.name.startsWith("form_fill[")) {
        element.addEventListener("input", this.handleFieldChange.bind(this));
        element.addEventListener("change", this.handleFieldChange.bind(this));
      }
    });

    // Track deficiency checkboxes separately
    const checkboxes = this.element.querySelectorAll(
      'input[type="checkbox"][name*="_c"], input[type="checkbox"][name*="_d"]',
    );
    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", this.handleFieldChange.bind(this));
    });
  }

  // Handle individual field changes
  handleFieldChange(event) {
    const element = event.target;
    const fieldName = this.extractFieldName(element);

    if (fieldName) {
      const fieldValue = this.getElementValue(element);
      const currentValue = this.changedFields.get(fieldName);

      // Only track if value actually changed
      if (currentValue !== fieldValue) {
        this.changedFields.set(fieldName, fieldValue);

        // Trigger debounced save
        this.debouncedSave();
      }
    }
  }

  // Extract field name from element
  extractFieldName(element) {
    if (element.name.startsWith("form_fill[")) {
      const match = element.name.match(/form_fill\[(.+)\]/);
      return match ? match[1] : null;
    }

    // Handle deficiency checkboxes
    if (element.name.endsWith("_c") || element.name.endsWith("_d")) {
      return element.name;
    }

    return null;
  }

  // Get value from form element
  getElementValue(element) {
    if (element.type === "checkbox") {
      return element.checked ? "Yes" : "";
    } else if (element.type === "radio") {
      return element.checked ? element.value : "";
    } else {
      return element.value || "";
    }
  }

  // Get only changed fields for incremental updates
  getChangedFields() {
    const changedData = {};

    this.changedFields.forEach((value, fieldName) => {
      changedData[fieldName] = value;
    });

    return changedData;
  }

  // Debounce utility function
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Save only changed data incrementally
  async saveDraftIncremental() {
    const changedData = this.getChangedFields();

    // Only save if there are actual changes
    if (Object.keys(changedData).length === 0) {
      return;
    }

    console.log("Saving incremental changes:", changedData);

    try {
      const formId = this.element.action.split("/").pop().split("?")[0];
      const response = await fetch(`/form_fills/${formId}/bulk_update_data`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": this.csrfToken,
          Accept: "application/json",
        },
        body: JSON.stringify({
          field_data: changedData,
        }),
      });

      if (response.ok) {
        // Clear changed fields after successful save
        this.changedFields.clear();

        // Use the existing notification system instead of custom indicator
        this.dispatchNotification("success", "Changes saved automatically");
      } else {
        console.error(
          "Failed to save incremental changes:",
          response.statusText,
        );
      }
    } catch (error) {
      console.error("Error saving incremental changes:", error);
    }
  }

  // Show subtle success indicator for incremental saves
  showIncrementalSaveSuccess() {
    // Create or update a subtle save indicator
    let indicator = document.getElementById("incremental-save-indicator");

    if (!indicator) {
      indicator = document.createElement("div");
      indicator.id = "incremental-save-indicator";
      indicator.className =
        "fixed top-4 right-4 z-40 px-3 py-1 bg-green-500 text-white text-sm rounded opacity-0 transition-opacity duration-300";
      indicator.textContent = "Saved";
      document.body.appendChild(indicator);
    }

    // Show indicator briefly
    indicator.style.opacity = "1";
    setTimeout(() => {
      indicator.style.opacity = "0";
    }, 1500);
  }

  serializeForm() {
    const formData = new FormData(this.element);
    const formFields = JSON.parse(
      this.element.dataset.formFillFormFieldsValue || "[]",
    );

    return JSON.stringify(
      formFields.map((field) => {
        if (field.type === "Photo") return field;

        if (field.type === "Deficiency") {
          return {
            ...field,
            value: formData.get(`form_fill[${field.name}_select]`) || "",
            comment_value:
              formData.get(`form_fill[${field.name}_comment]`) || "",
            Item: formData.get(`form_fill[${field.name}_item]`) || "",
            Riser: formData.get(`form_fill[${field.name}_riser]`) || "",
            C: formData.has(`${field.name}_c`) ? "Yes" : "",
            D: formData.has(`${field.name}_d`) ? "Yes" : "",
          };
        }

        return {
          ...field,
          value: formData.get(`form_fill[${field.name}]`) || field.value || "",
        };
      }),
    );
  }

  async saveDraft(event) {
    if (event) event.preventDefault();

    console.log(
      "FULL SAVE TRIGGERED - this should not happen during normal typing",
    );

    // Mostrar overlay de carga
    this.showSaveDraftOverlay();

    const formStructureHiddenInput = document.getElementById(
      "form_fill_form_structure",
    );
    if (formStructureHiddenInput) {
      formStructureHiddenInput.value = this.serializeForm();
    }

    // Crear FormData (las fotos ya se subieron inmediatamente)
    const formData = new FormData(this.element);

    try {
      const response = await fetch(this.element.action, {
        method: "PATCH",
        headers: { "X-CSRF-Token": this.csrfToken, Accept: "application/json" },
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        this.dispatchNotification(
          "success",
          data.message || "Draft saved successfully.",
        );
        await this.reloadFormStructure();
      } else {
        this.dispatchNotification(
          "error",
          data.message || "Could not save draft.",
        );
      }
    } catch (error) {
      this.dispatchNotification("error", "Network error when saving draft.");
    } finally {
      // Ocultar overlay de carga después de un pequeño delay para mejor UX
      setTimeout(() => {
        this.hideSaveDraftOverlay();
      }, 500);
    }
  }

  async submitToPdf(event) {
    event.stopPropagation();

    const confirmMessage = event.currentTarget.dataset.confirm;
    if (!confirm(confirmMessage)) return;

    const formStructureHiddenInput = document.getElementById(
      "form_fill_form_structure",
    );
    if (formStructureHiddenInput) {
      formStructureHiddenInput.value = this.serializeForm();
    }

    const dynamicForm = document.createElement("form");
    dynamicForm.method = "post";
    dynamicForm.action = this.element.action.replace(
      /(\/form_fills\/\d+).*/,
      "$1/submit_form",
    );

    const csrfInput = document.createElement("input");
    csrfInput.type = "hidden";
    csrfInput.name = "authenticity_token";
    csrfInput.value = this.csrfToken;
    dynamicForm.appendChild(csrfInput);

    const structureInput = document.createElement("input");
    structureInput.type = "hidden";
    structureInput.name = "form_fill[form_structure]";
    structureInput.value = formStructureHiddenInput.value;
    dynamicForm.appendChild(structureInput);

    document.body.appendChild(dynamicForm);
    dynamicForm.submit();
    document.body.removeChild(dynamicForm);
  }

  async reloadFormStructure() {
    try {
      const formId = this.element.action.split("/").pop().split("?")[0];
      const response = await fetch(`/form_fills/${formId}/structure`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": this.csrfToken,
        },
      });

      if (response.ok) {
        const data = await response.json();
        this.element.dataset.formFillFormStructureValue = data.form_structure;
        this.element.dataset.formFillFormFieldsValue = JSON.stringify(
          data.form_fields,
        );
        this.loadFormValues();
      }
    } catch (error) {
      console.error("Error reloading form structure:", error);
    }
  }

  // Método para actualizar el preview a estado guardado
  updatePhotoPreviewToSavedState(previewContainer, fileName) {
    const infoElement = previewContainer.querySelector(".file-info");
    if (infoElement) {
      infoElement.innerHTML = `
        <div class="flex justify-between items-center">
          <span class="flex items-center">
            <svg class="w-3 h-3 mr-1 text-green-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
            </svg>
            ${fileName}
          </span>
          <span class="text-green-400">Guardada</span>
        </div>
      `;
    } else {
      // Si no existe el elemento file-info, crearlo
      const newInfoElement = document.createElement("div");
      newInfoElement.className = "file-info text-xs text-slate-300 mt-2";
      newInfoElement.innerHTML = `
        <div class="flex justify-between items-center">
          <span class="flex items-center">
            <svg class="w-3 h-3 mr-1 text-green-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
            </svg>
            ${fileName}
          </span>
          <span class="text-green-400">Guardada</span>
        </div>
      `;
      previewContainer.appendChild(newInfoElement);
    }
  }

  // Método alternativo para cargar fotos cuando falla el método principal
  tryAlternativePhotoLoad(fieldData, previewContainer, imageElement) {
    console.log(`Trying alternative photo load for ${fieldData.name}`);

    // Intentar usar el photo_capture_controller si está disponible
    const photoCaptureController = previewContainer.closest(
      '[data-controller*="photo-capture"]',
    );
    if (photoCaptureController) {
      const controller = this.application.getControllerForElementAndIdentifier(
        photoCaptureController,
        "photo-capture",
      );

      if (controller && controller.loadExistingPhoto) {
        // Construir una URL de foto basada en el attachment_id
        const photoUrl = `/rails/active_storage/blobs/redirect/${fieldData.photo_attachment_id}/${fieldData.name}`;
        controller.loadExistingPhoto(photoUrl, fieldData.name);
        console.log(`Alternative photo load attempted for ${fieldData.name}`);
      }
    }

    // Como último recurso, intentar cargar directamente
    if (imageElement && fieldData.photo_attachment_id) {
      // Intentar diferentes formatos de URL
      const possibleUrls = [
        `/rails/active_storage/blobs/redirect/${fieldData.photo_attachment_id}/${fieldData.name}`,
        `/rails/active_storage/blobs/${fieldData.photo_attachment_id}/${fieldData.name}`,
        `/form_fills/${this.element.action.split("/").pop().split("?")[0]}/photo_url?field_name=${encodeURIComponent(fieldData.name)}`,
      ];

      // Probar cada URL hasta que una funcione
      this.tryUrls(
        possibleUrls,
        imageElement,
        previewContainer,
        fieldData.name,
      );
    }
  }

  // Método para probar múltiples URLs hasta encontrar una que funcione
  async tryUrls(urls, imageElement, previewContainer, fileName) {
    for (const url of urls) {
      try {
        const response = await fetch(url, { method: "HEAD" });
        if (response.ok) {
          imageElement.src = url;
          previewContainer.classList.remove("hidden");
          this.updatePhotoPreviewToSavedState(previewContainer, fileName);
          console.log(`Successfully loaded photo from: ${url}`);
          return;
        }
      } catch (error) {
        console.log(`Failed to load from ${url}:`, error);
      }
    }
    console.log(`All alternative URLs failed for ${fileName}`);
  }

  // Método para mostrar el overlay de carga durante save draft
  showSaveDraftOverlay() {
    const overlay = document.getElementById("save-draft-overlay");
    if (overlay) {
      overlay.classList.add("show");
      // Prevenir scroll del body mientras se muestra el overlay
      document.body.style.overflow = "hidden";
    }
  }

  // Método para ocultar el overlay de carga
  hideSaveDraftOverlay() {
    const overlay = document.getElementById("save-draft-overlay");
    if (overlay) {
      overlay.classList.remove("show");
      // Restaurar scroll del body
      document.body.style.overflow = "";
    }
  }

  dispatchNotification(type, message) {
    const event = new CustomEvent("show-notification", {
      bubbles: true,
      detail: { type, message },
    });
    window.dispatchEvent(event);
  }
}