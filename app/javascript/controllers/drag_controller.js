import { Controller } from "@hotwired/stimulus";
import Sortable from "sortablejs";

export default class extends Controller {
  static targets = [
    "list",
    "item", // Will refer to items on the current page
    "input",
    "prevButton",
    "nextButton",
    "pageInfo",
  ];

  connect() {
    this.itemsPerPage = 500; // Adjust as needed
    this.currentPage = 1;
    this.allItems = [];
    this.fieldCounter = 1;
    this.isInitialLoad = true;

    // Initial population of allItems from the DOM elements rendered by ERB
    // These elements are expected to have data-id and data-field-type, etc.
    const initialItems = Array.from(
      this.element.querySelectorAll('[data-drag-target="item"]'),
    );
    this.allItems = initialItems.map((itemEl) => {
      return this.extractItemData(itemEl);
    });

    this.initializeFieldCounter();

    if (this.listTarget) {
      this.sortable = Sortable.create(this.listTarget, {
        animation: 150,
        handle: ".handle",
        ghostClass: "sortable-ghost", // Corresponds to .sortable-ghost in CSS
        chosenClass: "sortable-chosen",
        dragClass: "sortable-drag",
        onEnd: this.onSortEnd.bind(this),
      });
    }

    this.renderCurrentPage();
    this.updateHiddenInput();
  }

  initializeFieldCounter() {
    // Contar campos existentes y empezar desde el siguiente número
    this.fieldCounter = this.allItems.length + 1;
    console.log(`Field counter inicializado en: ${this.fieldCounter}`);
  }

  disconnect() {
    if (this.sortable) {
      this.sortable.destroy();
    }
  }

  extractItemData(itemEl) {
    const fieldName = itemEl.dataset.id;
    const fieldType = itemEl.dataset.fieldType;

    const nameInput = itemEl.querySelector('[data-field-attribute="name"]');
    const typeSelect = itemEl.querySelector('[data-field-attribute="type"]');

    const labelNameInput = itemEl.querySelector(
      '[data-field-attribute="label_name"]',
    );
    const sectionNameInput = itemEl.querySelector(
      '[data-field-attribute="section_name"]',
    );
    const pageNumberInput = itemEl.querySelector(
      '[data-field-attribute="page_number"]',
    );
    const columnWidthInput = itemEl.querySelector(
      '[data-field-attribute="column_width"]',
    );
    const requiredInput = itemEl.querySelector(
      '[data-field-attribute="required"]',
    );

    const optionInputs = itemEl.querySelectorAll(
      '[data-field-attribute="option-value"]',
    );
    const options = Array.from(optionInputs)
      .map((input) => input.value)
      .filter((val) => val.trim() !== "");

    const baseField = {
      id: nameInput ? nameInput.value : fieldName,
      name: nameInput ? nameInput.value : fieldName,
      original_name: fieldName,
      type: typeSelect ? typeSelect.value : fieldType,
      value: "",
      human_label: nameInput ? nameInput.value : fieldName,
      label_name: labelNameInput ? labelNameInput.value : "",
      section_name: sectionNameInput ? sectionNameInput.value : "",
      page_number: pageNumberInput ? pageNumberInput.value : "",
      column_width: columnWidthInput ? columnWidthInput.value : "3",
      required: requiredInput ? requiredInput.checked : false,
    };

    const currentType = baseField.type;

    // Agregar campos específicos según el tipo
    if (currentType === "Photo") {
      baseField.photo_attachment_id = null; // Se llenará cuando se use en form_fill
    } else if (currentType === "Choice" || currentType === "Deficiency") {
      baseField.options = options.length > 0 ? options : null;
    }

    if (currentType === "Deficiency") {
      baseField.comment_value = "";
    }

    return baseField;
  }

  renderCurrentPage() {
    if (!this.listTarget) return;

    // Solo limpiar si no es la carga inicial
    if (this.isInitialLoad) {
      // En la carga inicial, no limpiar el DOM, solo agregar event listeners
      this.isInitialLoad = false;
      this.addEventListenersToPageItems();
      this.updatePaginationControls();
      return;
    }

    this.listTarget.innerHTML = ""; // Clear existing items solo si no es carga inicial

    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    const pageItems = this.allItems.slice(startIndex, endIndex);

    pageItems.forEach((itemData, indexOnPage) => {
      const itemEl = this.buildItemElement(itemData, startIndex + indexOnPage);
      this.listTarget.appendChild(itemEl);
    });

    this.addEventListenersToPageItems();
    this.updatePaginationControls();
  }

  buildItemElement(itemData, globalIndex) {
    const element = document.createElement('div');
    element.classList.add('field-item', 'bg-white/10', 'backdrop-blur-sm', 'rounded-2xl', 'p-6', 'border', 'border-white/20', 'shadow-lg');
    element.dataset.dragTarget = 'item';
    
    element.dataset.id = itemData.name || itemData.id;
    element.dataset.fieldType = itemData.type;

    const fieldIdBase = `field_${(itemData.name || itemData.id).replace(/\W/g, '_')}_${globalIndex}`;
    const hasOptions = itemData.type === 'Choice' || itemData.type === 'Deficiency';

    element.innerHTML = `
      <!-- Field Header -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
        <div class="flex items-center mb-2 sm:mb-0">
          <span class="handle text-slate-400 hover:text-indigo-400 mr-4 text-xl transition-colors duration-200">☰</span>
          <div class="flex items-center space-x-3">
            <input type="text" 
                   value="${itemData.name || itemData.id}" 
                   data-field-attribute="name"
                   class="editable-name bg-white/10 border border-white/20 rounded-lg py-2 px-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                   placeholder="Field Name">
            
            <select data-field-attribute="type" class="editable-type bg-white/10 border border-white/20 rounded-lg py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="Text" ${itemData.type === 'Text' ? 'selected' : ''}>Text</option>
              <option value="Choice" ${itemData.type === 'Choice' ? 'selected' : ''}>Choice</option>
              <option value="Button" ${itemData.type === 'Button' ? 'selected' : ''}>Button</option>
              <option value="Photo" ${itemData.type === 'Photo' ? 'selected' : ''}>Photo</option>
              <option value="Deficiency" ${itemData.type === 'Deficiency' ? 'selected' : ''}>Deficiency</option>
            </select>
          </div>
        </div>
        
        <button type="button" 
                class="delete-field-btn text-red-400 hover:text-red-300 transition-colors p-2 rounded-lg hover:bg-red-500/10" 
                data-action="click->drag#deleteField"
                title="Eliminar campo">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
          </svg>
        </button>
      </div>
      
      <!-- Configuration Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-white/10">
        <div class="space-y-2">
          <label for="${fieldIdBase}_label_name" class="block text-white font-semibold text-sm">Custom Label</label>
          <input type="text" id="${fieldIdBase}_label_name" value="${itemData.label_name || ''}" data-field-attribute="label_name" class="w-full bg-white/5 border border-white/20 rounded-xl py-3 px-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200" placeholder="Enter custom label">
        </div>
        <div class="space-y-2">
          <label for="${fieldIdBase}_section_name" class="block text-white font-semibold text-sm">Section Name</label>
          <input type="text" id="${fieldIdBase}_section_name" value="${itemData.section_name || ''}" data-field-attribute="section_name" class="w-full bg-white/5 border border-white/20 rounded-xl py-3 px-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200" placeholder="Enter section name">
        </div>
        <div class="space-y-2">
          <label for="${fieldIdBase}_page_number" class="block text-white font-semibold text-sm">Page Number</label>
          <input type="number" id="${fieldIdBase}_page_number" value="${itemData.page_number || ''}" data-field-attribute="page_number" class="w-full bg-white/5 border border-white/20 rounded-xl py-3 px-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200" placeholder="Page">
        </div>
        <div class="space-y-2">
          <label for="${fieldIdBase}_column_width" class="block text-white font-semibold text-sm">Column Width (1-9)</label>
          <input type="number" id="${fieldIdBase}_column_width" value="${itemData.column_width || 3}" data-field-attribute="column_width" min="1" max="9" class="w-full bg-white/5 border border-white/20 rounded-xl py-3 px-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200" placeholder="3">
        </div>
        <div class="flex items-center space-x-3 lg:col-span-4 mt-2">
          <input type="checkbox" id="${fieldIdBase}_required" ${itemData.required ? 'checked' : ''} data-field-attribute="required" class="w-5 h-5 text-indigo-600 bg-white/10 border-white/20 rounded focus:ring-indigo-500 focus:ring-2">
          <label for="${fieldIdBase}_required" class="text-white font-medium">Required Field</label>
        </div>
      </div>

      <!-- Options Section (for Choice and Deficiency fields) -->
      <div class="options-container ${hasOptions ? '' : 'hidden'}" data-field-attribute="options-container">
        <div class="border-t border-white/10 pt-4 mt-4">
          <div class="flex items-center justify-between mb-3">
            <label class="block text-white font-semibold text-sm">Options (for Choice & Deficiency fields)</label>
            <button type="button" 
                    class="add-option-btn bg-indigo-500 hover:bg-indigo-600 text-white text-xs px-3 py-1 rounded-lg transition-colors" 
                    data-action="click->drag#addOption"
                    data-field-name="${itemData.name}">
              + Add Option
            </button>
          </div>
          <div class="options-list space-y-2" data-field-attribute="options-list">
            ${this.buildOptionsHTML(itemData.options || [])}
          </div>
        </div>
      </div>

      <!-- Photo Field Info (solo para campos Photo) -->
      ${itemData.type === 'Photo' ? `
        <div class="photo-info border-t border-white/10 pt-4 mt-4">
          <div class="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
            <div class="flex items-center space-x-2 mb-2">
              <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
              </svg>
              <span class="text-purple-300 font-semibold text-sm">Photo Field</span>
            </div>
            <p class="text-purple-200 text-xs">
              Photo attachment ID will be generated when photos are uploaded in the form fill process
            </p>
            <p class="text-purple-300 text-xs mt-1">
              Format: inspection_[ID]_[field_name]_[unique_id]
            </p>
          </div>
        </div>
      ` : ''}
    `;
    return element;
  }

  // Método para construir el HTML de las opciones
  buildOptionsHTML(options) {
    return options
      .map(
        (option) => `
      <div class="option-item">
        <input type="text" 
               value="${option}" 
               data-field-attribute="option-value"
               class="option-input bg-white/5 border border-white/20 rounded-lg py-2 px-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
               placeholder="Option value">
        <button type="button" 
                class="remove-option-btn" 
                data-action="click->drag#removeOption">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
    `,
      )
      .join("");
  }

  createPhotoField() {
    const fieldName = `Photo Field ${this.fieldCounter}`;
    
    return {
      id: fieldName,
      name: fieldName,
      original_name: fieldName,
      type: "Photo",
      value: "",
      photo_attachment_id: null, // Se llenará en form_fill
      human_label: fieldName,
      label_name: fieldName,
      section_name: "",
      page_number: "1",
      column_width: "3",
      required: false
    };
  }

  addEventListenersToPageItems() {
    this.itemTargets.forEach((itemEl) => {
      const attributeInputs = itemEl.querySelectorAll("[data-field-attribute]");
      attributeInputs.forEach((input) => {
        // Remove old listener before adding new one to prevent duplicates if called multiple times
        input.removeEventListener(
          "input",
          this.handleAttributeChange.bind(this),
        );
        input.removeEventListener(
          "change",
          this.handleAttributeChange.bind(this),
        ); // Para selects
        input.addEventListener("input", this.handleAttributeChange.bind(this));
        input.addEventListener("change", this.handleAttributeChange.bind(this)); // Para selects
      });
    });
  }

  handleAttributeChange(event) {
    const changedInput = event.target;
    const itemEl = changedInput.closest('[data-drag-target="item"]');
    const itemId = itemEl.dataset.id;
    const attributeName = changedInput.dataset.fieldAttribute;

    // Buscar por name o id para compatibilidad
    const itemInAllItems = this.allItems.find(
      (item) => item.name === itemId || item.id === itemId,
    );
    if (itemInAllItems) {
      if (changedInput.type === "checkbox") {
        itemInAllItems[attributeName] = changedInput.checked;
      } else if (attributeName === "name") {
        // Manejar cambio de nombre del campo
        const oldId = itemInAllItems.name || itemInAllItems.id;
        const newName = changedInput.value;

        // Actualizar tanto id como name
        itemInAllItems.id = newName;
        itemInAllItems.name = newName;
        itemInAllItems.human_label = newName; // También actualizar human_label

        // Actualizar el dataset del elemento
        itemEl.dataset.id = newName;

        console.log(`Campo renombrado de "${oldId}" a "${newName}"`);
      } else if (attributeName === "type") {
        // Manejar cambio de tipo
        itemInAllItems.type = changedInput.value;
        itemEl.dataset.fieldType = changedInput.value;

        console.log(
          `Tipo de campo "${itemInAllItems.name}" cambiado a "${changedInput.value}"`,
        );
      } else if (attributeName === "option-value") {
        // Manejar cambio en opciones
        this.updateOptionsFromDOM(itemEl, itemInAllItems);
      } else {
        itemInAllItems[attributeName] = changedInput.value;
      }
      this.updateHiddenInput();
    }
  }

  // Método para manejar cambios de tipo de campo
  handleTypeChange(itemData, oldType, newType) {
    // Limpiar campos específicos del tipo anterior
    if (oldType === "Photo") {
      delete itemData.photo_attachment_id;
    } else if (oldType === "Choice" || oldType === "Deficiency") {
      delete itemData.options;
    }

    if (oldType === "Deficiency") {
      delete itemData.comment_value;
    }

    // Agregar campos específicos del nuevo tipo
    if (newType === "Photo") {
      // Agregar campo para ID de photo que se llenará después
      itemData.photo_attachment_id = null; // Se llenará cuando se suba la foto
    } else if (newType === "Choice" || newType === "Deficiency") {
      itemData.options =
        newType === "Deficiency" ? ["Minor", "Major", "Critical"] : [];
    }

    if (newType === "Deficiency") {
      itemData.comment_value = "";
    }

    console.log(`Type change applied: ${oldType} -> ${newType}`, itemData);
  }

  // Método para actualizar opciones desde el DOM
  updateOptionsFromDOM(itemEl, itemData) {
    const optionInputs = itemEl.querySelectorAll(
      '[data-field-attribute="option-value"]',
    );
    const options = Array.from(optionInputs)
      .map((input) => input.value)
      .filter((val) => val.trim() !== "");
    itemData.options = options.length > 0 ? options : null;
    this.updateHiddenInput();
  }

  // Método para agregar una nueva opción
  addOption(event) {
    const button = event.target.closest('[data-action*="addOption"]');
    const itemEl = button.closest('[data-drag-target="item"]');
    const optionsList = itemEl.querySelector(
      '[data-field-attribute="options-list"]',
    );

    const optionHTML = `
      <div class="option-item">
        <input type="text" 
               value="" 
               data-field-attribute="option-value"
               class="option-input bg-white/5 border border-white/20 rounded-lg py-2 px-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
               placeholder="Option value">
        <button type="button" 
                class="remove-option-btn" 
                data-action="click->drag#removeOption">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
    `;

    optionsList.insertAdjacentHTML("beforeend", optionHTML);

    // Agregar event listener al nuevo input
    const newInput = optionsList.lastElementChild.querySelector(
      '[data-field-attribute="option-value"]',
    );
    newInput.addEventListener("input", this.handleAttributeChange.bind(this));

    // Focus en el nuevo input
    newInput.focus();

    // Actualizar el array de opciones
    const itemId = itemEl.dataset.id;
    const itemInAllItems = this.allItems.find(
      (item) => item.name === itemId || item.id === itemId,
    );
    if (itemInAllItems) {
      this.updateOptionsFromDOM(itemEl, itemInAllItems);
    }

    console.log(`Nueva opción agregada al campo "${itemId}"`);
  }

  // Método para eliminar una opción
  removeOption(event) {
    const button = event.target.closest(".remove-option-btn");
    const optionItem = button.closest(".option-item");
    const itemEl = button.closest('[data-drag-target="item"]');

    optionItem.remove();

    // Actualizar el array de opciones
    const itemId = itemEl.dataset.id;
    const itemInAllItems = this.allItems.find(
      (item) => item.name === itemId || item.id === itemId,
    );
    if (itemInAllItems) {
      this.updateOptionsFromDOM(itemEl, itemInAllItems);
    }

    console.log(`Opción eliminada del campo "${itemId}"`);
  }

  // Método para eliminar un campo completo
  deleteField(event) {
    const button = event.target.closest(".delete-field-btn");
    const itemEl = button.closest('[data-drag-target="item"]');
    const itemId = itemEl.dataset.id;

    // Buscar el campo en allItems
    const fieldToDelete = this.allItems.find((item) => item.name === itemId);

    if (!fieldToDelete) {
      console.error(`Campo "${itemId}" no encontrado en allItems`);
      this.showNotification("Error: Campo no encontrado", "error");
      return;
    }

    // Confirmar eliminación
    if (
      confirm(
        `¿Está seguro de que desea eliminar el campo "${fieldToDelete.name}"?\n\nEsta acción no se puede deshacer.`,
      )
    ) {
      try {
        // Eliminar del array
        this.allItems = this.allItems.filter((item) => item.name !== itemId);

        console.log(
          `Campo "${itemId}" eliminado. Campos restantes: ${this.allItems.length}`,
        );

        // Re-renderizar la página actual (forzar re-render)
        this.isInitialLoad = false; // Asegurar que no es carga inicial
        this.renderCurrentPage();

        // Actualizar el input hidden
        this.updateHiddenInput();

        // Mostrar notificación de éxito
        this.showNotification(
          `Campo "${fieldToDelete.name}" eliminado exitosamente`,
          "success",
        );

        // Si la página actual está vacía y no es la primera, ir a la página anterior
        if (this.allItems.length > 0) {
          const totalPages = Math.ceil(
            this.allItems.length / this.itemsPerPage,
          );
          if (this.currentPage > totalPages) {
            this.currentPage = totalPages;
            this.renderCurrentPage();
          }
        }
      } catch (error) {
        console.error("Error al eliminar campo:", error);
        this.showNotification("Error al eliminar el campo", "error");
      }
    }
  }

  onSortEnd(event) {
    const { oldIndex, newIndex, item } = event;
    const itemId = item.dataset.id;

    // Calculate global indices based on current page
    const globalOldIndex =
      (this.currentPage - 1) * this.itemsPerPage + oldIndex;
    const globalNewIndex =
      (this.currentPage - 1) * this.itemsPerPage + newIndex;

    // Update allItems array
    // Buscar por name para compatibilidad
    const movedItem = this.allItems.find((i) => i.name === itemId);
    if (!movedItem) return;

    // Find the item in allItems, remove it, then insert it at the new global position
    const itemToMoveIndex = this.allItems.findIndex((i) => i.name === itemId);
    if (itemToMoveIndex === -1) return; // Should not happen

    const [itemActualToMove] = this.allItems.splice(itemToMoveIndex, 1);
    this.allItems.splice(globalNewIndex, 0, itemActualToMove);

    this.updateHiddenInput();
    // No re-renderizar después de drag & drop para mantener elementos DOM
    // this.renderCurrentPage(); // Comentado para evitar que desaparezcan los campos
  }

  updateHiddenInput() {
    // No agregar campo position innecesario
    const payload = this.allItems.map((item) => ({
      ...item,
    }));

    if (this.hasInputTarget) {
      this.inputTarget.value = JSON.stringify(payload);
    }
    console.log("Updated hidden input with all items:", payload); // Para debugging
  }

  updatePaginationControls() {
    if (!this.hasPageInfoTarget) return;

    const totalPages = Math.ceil(this.allItems.length / this.itemsPerPage);
    this.pageInfoTarget.textContent = `Page ${this.currentPage} of ${totalPages || 1}`;

    if (this.hasPrevButtonTarget) {
      this.prevButtonTarget.disabled = this.currentPage === 1;
    }
    if (this.hasNextButtonTarget) {
      this.nextButtonTarget.disabled =
        this.currentPage === totalPages || totalPages === 0;
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.renderCurrentPage();
    }
  }

  nextPage() {
    const totalPages = Math.ceil(this.allItems.length / this.itemsPerPage);
    if (this.currentPage < totalPages) {
      this.currentPage++;
      this.renderCurrentPage();
    }
  }

  // Método para agregar un nuevo campo
  addNewField(event) {
    console.log("=== AGREGANDO NUEVO CAMPO ===");

    try {
      // Crear el nuevo campo por defecto tipo Deficiency
      const newField = this.createDefaultField();
      console.log("Nuevo campo creado:", newField);

      // Agregar el campo al array
      this.allItems.push(newField);
      console.log(`Campo agregado. Total campos: ${this.allItems.length}`);

      // Ir a la última página si es necesario
      const totalPages = Math.ceil(this.allItems.length / this.itemsPerPage);
      this.currentPage = totalPages;
      console.log(`Navegando a página: ${totalPages}`);

      // Re-renderizar la página actual
      this.renderCurrentPage();
      console.log("Página re-renderizada");

      // Actualizar el input hidden
      this.updateHiddenInput();
      console.log("Input hidden actualizado");

      // Scroll al campo recién agregado
      this.scrollToNewField();

      // Mostrar notificación de éxito
      this.showNotification(
        `Campo "${newField.name}" agregado exitosamente`,
        "success",
      );

      // Incrementar contador para el próximo campo
      this.fieldCounter++;

      console.log(`=== CAMPO AGREGADO EXITOSAMENTE: ${newField.name} ===`);
    } catch (error) {
      console.error("Error detallado al agregar nuevo campo:", error);
      this.showNotification("Error al agregar el campo", "error");
    }
  }

  // Método para crear un campo por defecto tipo Deficiency
  createDefaultField() {
    const fieldName = `Deficiency Field ${this.fieldCounter}`;

    return {
      id: fieldName,
      name: fieldName,
      original_name: fieldName,
      type: "Deficiency",
      value: "",
      options: ["Minor", "Major", "Critical"], // Opciones por defecto para Deficiency
      human_label: fieldName,
      label_name: fieldName,
      section_name: "",
      page_number: "1",
      column_width: "3",
      required: false,
    };
  }

  // Método para hacer scroll al nuevo campo
  scrollToNewField() {
    setTimeout(() => {
      const listContainer = this.listTarget;
      if (listContainer) {
        listContainer.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    }, 100);
  }

  // Método para mostrar notificaciones
  showNotification(message, type = "info") {
    // Crear notificación temporal
    const notification = document.createElement("div");
    notification.className = `fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg transition-all duration-300 transform translate-x-full`;

    // Estilos según el tipo
    if (type === "success") {
      notification.className += ` bg-green-500 text-white`;
    } else if (type === "error") {
      notification.className += ` bg-red-500 text-white`;
    } else {
      notification.className += ` bg-blue-500 text-white`;
    }

    notification.innerHTML = `
      <div class="flex items-center space-x-2">
        <span>${message}</span>
        <button class="ml-2 text-white hover:text-gray-200" onclick="this.parentElement.parentElement.remove()">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
    `;

    document.body.appendChild(notification);

    // Animar entrada
    setTimeout(() => {
      notification.classList.remove("translate-x-full");
    }, 10);

    // Auto-remover después de 3 segundos
    setTimeout(() => {
      if (notification.parentElement) {
        notification.classList.add("translate-x-full");
        setTimeout(() => {
          if (notification.parentElement) {
            notification.remove();
          }
        }, 300);
      }
    }, 3000);
  }

  isFieldNameUnique(fieldName) {
    return !this.allItems.some(
      (item) => item.name === fieldName || item.id === fieldName,
    );
  }
}
