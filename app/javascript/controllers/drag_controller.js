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
    this.isUpdating = false; // Flag para evitar actualizaciones concurrentes

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
  }

  disconnect() {
    if (this.sortable) {
      this.sortable.destroy();
    }
  }

  // Método para enviar notificaciones usando el notification controller
  sendNotification(message, type = "info") {
    const event = new CustomEvent("show-notification", {
      detail: { message, type },
      bubbles: true,
    });
    document.dispatchEvent(event);
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

    // Signature-specific inputs
    const signaturePadHeightInput = itemEl.querySelector(
      '[data-field-attribute="signature_pad_height"]',
    );
    const signatureStrokeWidthInput = itemEl.querySelector(
      '[data-field-attribute="signature_stroke_width"]',
    );
    const signatureStrokeColorInput = itemEl.querySelector(
      '[data-field-attribute="signature_stroke_color"]',
    );

    // Extraer opciones (tanto label como valor)
    const optionsContainer = itemEl.querySelector(
      '[data-field-attribute="options-container"]',
    );
    let options = [];

    if (optionsContainer) {
      const optionItems = optionsContainer.querySelectorAll(".option-item");

      optionItems.forEach((optionItem) => {
        const labelInput = optionItem.querySelector(
          '[data-field-attribute="option-label"]',
        );
        const valueInput = optionItem.querySelector(
          '[data-field-attribute="option-value"]',
        );

        if (labelInput && valueInput) {
          const label = labelInput.value.trim();
          const value = valueInput.value.trim();

          if (label && value) {
            // Si label y value son iguales, guardar como string simple para compatibilidad
            if (label === value) {
              options.push(value);
            } else {
              // Si son diferentes, guardar como array [label, valor]
              options.push([label, value]);
            }
          }
        }
      });
    }

    // Extraer campos específicos de Deficiency
    const itemInput = itemEl.querySelector('[data-field-attribute="item"]');
    const riserInput = itemEl.querySelector('[data-field-attribute="riser"]');

    // Extraer categorías seleccionadas para campos de categoría
    const selectedCategoriesElement = itemEl.querySelector(
      '[data-field-attribute="selected-categories"]',
    );
    let selectedCategories = [];
    if (
      selectedCategoriesElement &&
      selectedCategoriesElement.textContent.trim() !== "No categories selected"
    ) {
      selectedCategories = selectedCategoriesElement.textContent
        .split(", ")
        .filter((cat) => cat.trim() !== "");
    }

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
    } else if (
      ["Choice", "Deficiency", "Pass/Fail", "Radio"].includes(currentType)
    ) {
      baseField.options =
        options.length > 0
          ? options
          : this.getDefaultOptionsForType(currentType);
    }

    // Campos específicos para Deficiency y Deficiency_field
    if (["Deficiency", "Deficiency_field"].includes(currentType)) {
      baseField.comment_value = "";
      baseField.Item = itemInput ? itemInput.value : "";
      baseField.Riser = riserInput ? riserInput.value : "";
      baseField.D = ""; // Campo oculto para llenar en otra vista
      baseField.C = ""; // Campo oculto para llenar en otra vista
      baseField.select = "";
    }

    // Campos específicos para System Category e Interval Category
    if (["System Category", "Interval Category"].includes(currentType)) {
      baseField.selected_categories = selectedCategories;
    }

    // Specific fields for Signature
    if (currentType === "Signature") {
      baseField.signature_config = {
        pad_height: signaturePadHeightInput
          ? parseInt(signaturePadHeightInput.value || 200, 10)
          : 200,
        stroke_width: signatureStrokeWidthInput
          ? parseInt(signatureStrokeWidthInput.value || 2, 10)
          : 2,
        stroke_color: signatureStrokeColorInput
          ? signatureStrokeColorInput.value || "#000000"
          : "#000000",
      };
    }

    return baseField;
  }

  // Método para obtener opciones por defecto según el tipo
  getDefaultOptionsForType(type) {
    switch (type) {
      case "Deficiency":
        return ["Minor", "Major", "Critical"];
      case "Pass/Fail":
        return ["Pass", "Fail", "N/A"];
      case "Button":
        return ["Yes"];
      case "Radio":
        return [
          ["Yes", "Choice1"],
          ["No", "Choice2"],
        ]; // Ejemplo con label/valor diferentes
      case "Choice":
        return [];
      case "System Category":
      case "Interval Category":
        return []; // Categories don't use options, they use selected_categories
      default:
        return null;
    }
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
    const element = document.createElement("div");
    element.classList.add(
      "field-item",
      "bg-white/10",
      "backdrop-blur-sm",
      "rounded-2xl",
      "p-6",
      "border",
      "border-white/20",
      "shadow-lg",
    );
    element.dataset.dragTarget = "item";

    element.dataset.id = itemData.name || itemData.id;
    element.dataset.fieldType = itemData.type;
    element.dataset.originalName =
      itemData.original_name || itemData.name || itemData.id;

    const fieldIdBase = `field_${(itemData.name || itemData.id).replace(/\W/g, "_")}_${globalIndex}`;
    const hasOptions = [
      "Choice",
      "Deficiency",
      "Pass/Fail",
      "Radio",
      "Button",
    ].includes(itemData.type);
    const isDeficiencyType = ["Deficiency", "Deficiency_field"].includes(
      itemData.type,
    );

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
              <option value="Text" ${itemData.type === "Text" ? "selected" : ""}>Text</option>
              <option value="Choice" ${itemData.type === "Choice" ? "selected" : ""}>Choice</option>
              <option value="Button" ${itemData.type === "Button" ? "selected" : ""}>Button</option>
              <option value="Photo" ${itemData.type === "Photo" ? "selected" : ""}>Photo</option>
              <option value="Signature" ${itemData.type === "Signature" ? "selected" : ""}>Signature</option>
              <option value="Deficiency" ${itemData.type === "Deficiency" ? "selected" : ""}>Deficiency</option>
              <option value="Pass/Fail" ${itemData.type === "Pass/Fail" ? "selected" : ""}>Pass/Fail</option>
              <option value="Radio" ${itemData.type === "Radio" ? "selected" : ""}>Radio</option>
              <option value="Date" ${itemData.type === "Date" ? "selected" : ""}>Date</option>
              <option value="Deficiency_field" ${itemData.type === "Deficiency_field" ? "selected" : ""}>Deficiency Field</option>
              <option value="System Category" ${itemData.type === "System Category" ? "selected" : ""}>System Category</option>
              <option value="Interval Category" ${itemData.type === "Interval Category" ? "selected" : ""}>Interval Category</option>
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
          <input type="text" id="${fieldIdBase}_label_name" value="${itemData.label_name || ""}" data-field-attribute="label_name" class="w-full bg-white/5 border border-white/20 rounded-xl py-3 px-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200" placeholder="Enter custom label">
        </div>
        <div class="space-y-2">
          <label for="${fieldIdBase}_section_name" class="block text-white font-semibold text-sm">Section Name</label>
          <input type="text" id="${fieldIdBase}_section_name" value="${itemData.section_name || ""}" data-field-attribute="section_name" class="w-full bg-white/5 border border-white/20 rounded-xl py-3 px-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200" placeholder="Enter section name">
        </div>
        <div class="space-y-2">
          <label for="${fieldIdBase}_page_number" class="block text-white font-semibold text-sm">Page Number</label>
          <input type="number" id="${fieldIdBase}_page_number" value="${itemData.page_number || ""}" data-field-attribute="page_number" class="w-full bg-white/5 border border-white/20 rounded-xl py-3 px-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200" placeholder="Page">
        </div>
        <div class="space-y-2">
          <label for="${fieldIdBase}_column_width" class="block text-white font-semibold text-sm">Column Width (1-9)</label>
          <input type="number" id="${fieldIdBase}_column_width" value="${itemData.column_width || 3}" data-field-attribute="column_width" min="1" max="9" class="w-full bg-white/5 border border-white/20 rounded-xl py-3 px-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200" placeholder="3">
        </div>
        <div class="flex items-center space-x-3 lg:col-span-4 mt-2">
          <input type="checkbox" id="${fieldIdBase}_required" ${itemData.required ? "checked" : ""} data-field-attribute="required" class="w-5 h-5 text-indigo-600 bg-white/10 border-white/20 rounded focus:ring-indigo-500 focus:ring-2">
          <label for="${fieldIdBase}_required" class="text-white font-medium">Required Field</label>
        </div>
      </div>

      <!-- Campos específicos para Deficiency y Deficiency_field -->
      ${
        isDeficiencyType
          ? `
        <div class="deficiency-fields border-t border-white/10 pt-4 mt-4">
          <div class="mb-4">
            <div class="flex items-center space-x-2 mb-3">
              <svg class="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
              </svg>
              <span class="text-orange-300 font-semibold text-sm">Deficiency Fields</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="space-y-2">
                <label for="${fieldIdBase}_item" class="block text-white font-semibold text-sm">Item</label>
                <input type="text" 
                       id="${fieldIdBase}_item" 
                       value="${itemData.Item || ""}" 
                       data-field-attribute="item"
                       class="w-full bg-orange-500/10 border border-orange-500/20 rounded-xl py-3 px-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200" 
                       placeholder="Enter item description">
              </div>
              <div class="space-y-2">
                <label for="${fieldIdBase}_riser" class="block text-white font-semibold text-sm">Riser</label>
                <input type="text" 
                       id="${fieldIdBase}_riser" 
                       value="${itemData.Riser || ""}" 
                       data-field-attribute="riser"
                       class="w-full bg-orange-500/10 border border-orange-500/20 rounded-xl py-3 px-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200" 
                       placeholder="Enter riser information">
              </div>
            </div>
            <div class="mt-3 p-3 bg-orange-500/5 border border-orange-500/10 rounded-lg">
              <p class="text-orange-200 text-xs">
                <strong>Note:</strong> Fields D and C are automatically included in the JSON structure and will be filled in the form completion view.
              </p>
            </div>
          </div>
        </div>
      `
          : ""
      }

      <!-- Signature Field Configuration -->
      ${
        itemData.type === "Signature"
          ? `
        <div class="signature-fields border-t border-white/10 pt-4 mt-4">
          <div class="mb-4">
            <div class="flex items-center space-x-2 mb-3">
              <svg class="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16c1.5-1.5 3-1.5 4.5 0S14.5 17.5 16 16m-9-4c1.5-1.5 3-1.5 4.5 0S14.5 13.5 16 12m-9-4c1.5-1.5 3-1.5 4.5 0S14.5 9.5 16 8" />
              </svg>
              <span class="text-teal-300 font-semibold text-sm">Signature Configuration</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div class="space-y-2">
                <label for="${fieldIdBase}_signature_pad_height" class="block text-white font-semibold text-sm">Pad Height (px)</label>
                <input type="number" id="${fieldIdBase}_signature_pad_height" value="${(itemData.signature_config && itemData.signature_config.pad_height) || 200}" data-field-attribute="signature_pad_height" min="100" max="600" class="w-full bg-white/5 border border-white/20 rounded-xl py-3 px-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all duration-200" placeholder="200">
              </div>
              <div class="space-y-2">
                <label for="${fieldIdBase}_signature_stroke_width" class="block text-white font-semibold text-sm">Stroke Width (px)</label>
                <input type="number" id="${fieldIdBase}_signature_stroke_width" value="${(itemData.signature_config && itemData.signature_config.stroke_width) || 2}" data-field-attribute="signature_stroke_width" min="1" max="10" class="w-full bg-white/5 border border-white/20 rounded-xl py-3 px-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all duration-200" placeholder="2">
              </div>
              <div class="space-y-2">
                <label for="${fieldIdBase}_signature_stroke_color" class="block text-white font-semibold text-sm">Stroke Color</label>
                <input type="text" id="${fieldIdBase}_signature_stroke_color" value="${(itemData.signature_config && itemData.signature_config.stroke_color) || '#000000'}" data-field-attribute="signature_stroke_color" class="w-full bg-white/5 border border-white/20 rounded-xl py-3 px-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all duration-200" placeholder="#000000">
              </div>
            </div>
            <div class="mt-3 p-3 bg-teal-500/5 border border-teal-500/10 rounded-lg">
              <p class="text-teal-200 text-xs">The signature will be captured as an image (no credentials) and can be synchronized when online.</p>
            </div>
          </div>
        </div>
      `
          : ""
      }

      <!-- Category Selection Section (for System Category and Interval Category fields) -->
      ${
        ["System Category", "Interval Category"].includes(itemData.type)
          ? `
        <div class="category-selection-fields border-t border-white/10 pt-4 mt-4">
          <div class="mb-4">
            <div class="flex items-center space-x-2 mb-3">
              <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
              </svg>
              <span class="text-purple-300 font-semibold text-sm">${itemData.type} Configuration</span>
            </div>
            
            <!-- Category Selection Button -->
            <div class="space-y-3">
              <button type="button" 
                      class="w-full p-4 bg-purple-500/20 border border-purple-500/30 rounded-xl text-white hover:bg-purple-500/30 transition-all duration-200 flex items-center justify-between"
                      data-action="click->category-selector#openModal"
                      data-field-name="${itemData.name}"
                      data-field-type="${itemData.type}">
                <div class="flex items-center space-x-3">
                  <svg class="w-5 h-5 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path>
                  </svg>
                  <span class="font-medium">Select ${itemData.type}</span>
                </div>
                <svg class="w-5 h-5 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                </svg>
              </button>
              
              <!-- Selected Categories Display -->
              <div class="selected-categories-display p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                <div class="text-purple-200 text-sm font-medium mb-2">Selected Categories:</div>
                <div class="selected-categories-list text-purple-100 text-sm" data-field-attribute="selected-categories">
                  ${
                    itemData.selected_categories &&
                    itemData.selected_categories.length > 0
                      ? itemData.selected_categories.join(", ")
                      : '<span class="text-purple-300 italic">No categories selected</span>'
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      `
          : ""
      }

      <!-- Options Section (for Choice and Deficiency fields) -->
      <div class="options-container ${hasOptions ? "" : "hidden"}" data-field-attribute="options-container">
        <div class="border-t border-white/10 pt-4 mt-4">
          <div class="flex items-center justify-between mb-3">
            <div>
              <label class="block text-white font-semibold text-sm">Options (for Choice, Deficiency, Pass/Fail & Radio fields)</label>
              <p class="text-slate-400 text-xs mt-1">Label: what users see | Value: what gets submitted</p>
            </div>
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
      ${
        itemData.type === "Photo"
          ? `
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
      `
          : ""
      }
    `;
    return element;
  }

  // Método para construir el HTML de las opciones
  buildOptionsHTML(options) {
    return options
      .map((option) => {
        // Determinar si es array [label, valor] o string simple
        const isArray = Array.isArray(option);
        const label = isArray ? option[0] : option;
        const value = isArray ? option[1] : option;

        return `
      <div class="option-item">
        <div class="grid grid-cols-2 gap-2 flex-1">
          <input type="text" 
                 value="${label}" 
                 data-field-attribute="option-label"
                 class="option-input bg-white/5 border border-white/20 rounded-lg py-2 px-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                 placeholder="Display label">
          <input type="text" 
                 value="${value}" 
                 data-field-attribute="option-value"
                 class="option-input bg-white/5 border border-white/20 rounded-lg py-2 px-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                 placeholder="Form value">
        </div>
        <button type="button" 
                class="remove-option-btn" 
                data-action="click->drag#removeOption">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
    `;
      })
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
      required: false,
    };
  }

  // Método para crear un campo de categoría
  createCategoryField(type) {
    const fieldName = `${type} Field ${this.fieldCounter}`;

    return {
      id: fieldName,
      name: fieldName,
      original_name: fieldName,
      type: type,
      value: "",
      selected_categories: [],
      human_label: fieldName,
      label_name: fieldName,
      section_name: "",
      page_number: "1",
      column_width: "3",
      required: false,
    };
  }

  addEventListenersToPageItems() {
    // Crear una función bound una sola vez para poder removerla correctamente
    if (!this.boundHandleAttributeChange) {
      this.boundHandleAttributeChange = this.handleAttributeChange.bind(this);
    }

    this.itemTargets.forEach((itemEl) => {
      const attributeInputs = itemEl.querySelectorAll("[data-field-attribute]");
      attributeInputs.forEach((input) => {
        // Remove old listener before adding new one to prevent duplicates
        input.removeEventListener("input", this.boundHandleAttributeChange);
        input.removeEventListener("change", this.boundHandleAttributeChange);

        // Add new listeners
        input.addEventListener("input", this.boundHandleAttributeChange);
        input.addEventListener("change", this.boundHandleAttributeChange);
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

    if (!itemInAllItems) {
      return;
    }

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
      } else if (attributeName === "type") {
        // Manejar cambio de tipo
        const oldType = itemInAllItems.type;
        const newType = changedInput.value;

        // Actualizar tipo
        itemInAllItems.type = newType;
        itemEl.dataset.fieldType = newType;

        // Aplicar cambios específicos del tipo
        this.handleTypeChange(itemInAllItems, oldType, newType);

        // Actualizar visibilidad del contenedor de opciones
        this.updateOptionsContainerVisibility(itemEl, newType);

        // Solo re-renderizar si es necesario para campos específicos (Deficiency, etc.)
        if (
          [
            "Deficiency",
            "Deficiency_field",
            "System Category",
            "Interval Category",
          ].includes(newType) ||
          [
            "Deficiency",
            "Deficiency_field",
            "System Category",
            "Interval Category",
          ].includes(oldType)
        ) {
          // IMPORTANTE: Actualizar el hidden input ANTES del re-render para evitar pérdida de datos
          this.updateHiddenInput();
          console.log(
            `Re-rendering due to type change from ${oldType} to ${newType}`,
          );
          this.renderCurrentPage();
        } else {
          // Para otros tipos, solo actualizar el hidden input
          this.updateHiddenInput();
        }
      } else if (
        attributeName === "option-value" ||
        attributeName === "option-label"
      ) {
        // Manejar cambio en opciones (tanto label como value)
        this.updateSingleFieldOptions(itemEl, itemInAllItems);
      } else if (attributeName === "item") {
        // Manejar cambio en campo Item de Deficiency
        itemInAllItems.Item = changedInput.value;
      } else if (attributeName === "riser") {
        // Manejar cambio en campo Riser de Deficiency
        itemInAllItems.Riser = changedInput.value;
      } else if (attributeName === "selected-categories") {
        // Manejar cambio en categorías seleccionadas (esto se maneja desde category-selector controller)
        // No hacer nada aquí, se actualiza desde el category selector
        return;
      } else {
        itemInAllItems[attributeName] = changedInput.value;
      }

      this.updateHiddenInput();
    }
  }

  // Método para actualizar la visibilidad del contenedor de opciones
  updateOptionsContainerVisibility(itemEl, fieldType) {
    const optionsContainer = itemEl.querySelector(
      '[data-field-attribute="options-container"]',
    );
    const hasOptions = ["Choice", "Deficiency", "Pass/Fail", "Radio", "Button"].includes(
      fieldType,
    );

    if (optionsContainer) {
      if (hasOptions) {
        optionsContainer.classList.remove("hidden");
      } else {
        optionsContainer.classList.add("hidden");
      }
    }
  }

  // Método para manejar cambios de tipo de campo
  handleTypeChange(itemData, oldType, newType) {
    // Limpiar campos específicos del tipo anterior
    if (oldType === "Photo") {
      delete itemData.photo_attachment_id;
    } else if (
      ["Choice", "Deficiency", "Pass/Fail", "Radio", "Button"].includes(oldType)
    ) {
      delete itemData.options;
    }

    if (["Deficiency", "Deficiency_field"].includes(oldType)) {
      delete itemData.comment_value;
      delete itemData.Item;
      delete itemData.Riser;
      delete itemData.D;
      delete itemData.C;
    }

    if (["System Category", "Interval Category"].includes(oldType)) {
      delete itemData.selected_categories;
    }

    // Agregar campos específicos del nuevo tipo
    if (newType === "Photo") {
      // Agregar campo para ID de photo que se llenará después
      itemData.photo_attachment_id = null; // Se llenará cuando se suba la foto
    } else if (
      ["Choice", "Deficiency", "Pass/Fail", "Radio", "Button"].includes(newType)
    ) {
      itemData.options = this.getDefaultOptionsForType(newType);
    }

    if (["Deficiency", "Deficiency_field"].includes(newType)) {
      itemData.comment_value = "";
      itemData.Item = "";
      itemData.Riser = "";
      itemData.D = ""; // Campo oculto para llenar en otra vista
      itemData.C = ""; // Campo oculto para llenar en otra vista
    }

    if (["System Category", "Interval Category"].includes(newType)) {
      itemData.selected_categories = [];
    }
  }

  // Método específico para actualizar opciones de un solo campo
  updateSingleFieldOptions(itemEl, itemData) {
    // Evitar actualizaciones concurrentes
    if (this.isUpdating) {
      return;
    }

    this.isUpdating = true;

    // Verificar que el elemento corresponde al campo correcto
    const elementFieldId = itemEl.dataset.id;
    if (elementFieldId !== itemData.name && elementFieldId !== itemData.id) {
      this.isUpdating = false;
      return;
    }

    // Buscar específicamente el contenedor de opciones de este campo
    const optionsContainer = itemEl.querySelector(
      '[data-field-attribute="options-container"]',
    );
    if (!optionsContainer) {
      this.isUpdating = false;
      return;
    }

    // Solo seleccionar option-items dentro del contenedor de opciones de este campo específico
    const optionItems = optionsContainer.querySelectorAll(".option-item");
    const options = [];

    optionItems.forEach((optionItem) => {
      const labelInput = optionItem.querySelector(
        '[data-field-attribute="option-label"]',
      );
      const valueInput = optionItem.querySelector(
        '[data-field-attribute="option-value"]',
      );

      if (labelInput && valueInput) {
        const label = labelInput.value.trim();
        const value = valueInput.value.trim();

        if (label && value) {
          // Si label y value son iguales, guardar como string simple para compatibilidad
          if (label === value) {
            options.push(value);
          } else {
            // Si son diferentes, guardar como array [label, valor]
            options.push([label, value]);
          }
        }
      }
    });

    // Actualizar solo este campo específico
    itemData.options = options.length > 0 ? options : null;

    // Actualizar el hidden input con todos los datos
    this.updateHiddenInput();

    // Liberar el flag de actualización
    this.isUpdating = false;
  }

  // Método para actualizar opciones desde el DOM (mantener para compatibilidad)
  updateOptionsFromDOM(itemEl, itemData) {
    // Verificar que el elemento corresponde al campo correcto
    const elementFieldId = itemEl.dataset.id;
    if (elementFieldId !== itemData.name && elementFieldId !== itemData.id) {
      console.error(
        `Mismatch: Element ID "${elementFieldId}" doesn't match item data "${itemData.name}"`,
      );
      return;
    }

    // Buscar específicamente el contenedor de opciones de este campo
    const optionsContainer = itemEl.querySelector(
      '[data-field-attribute="options-container"]',
    );
    if (!optionsContainer) {
      console.log(`No options container found for field ${itemData.name}`);
      return;
    }

    // Solo seleccionar option-items dentro del contenedor de opciones de este campo específico
    const optionItems = optionsContainer.querySelectorAll(".option-item");
    const options = [];

    console.log(
      `Updating options for field "${itemData.name}", found ${optionItems.length} option items`,
    );

    optionItems.forEach((optionItem, index) => {
      const labelInput = optionItem.querySelector(
        '[data-field-attribute="option-label"]',
      );
      const valueInput = optionItem.querySelector(
        '[data-field-attribute="option-value"]',
      );

      if (labelInput && valueInput) {
        const label = labelInput.value.trim();
        const value = valueInput.value.trim();

        console.log(`Option ${index}: label="${label}", value="${value}"`);

        if (label && value) {
          // Si label y value son iguales, guardar como string simple para compatibilidad
          if (label === value) {
            options.push(value);
          } else {
            // Si son diferentes, guardar como array [label, valor]
            options.push([label, value]);
          }
        }
      }
    });

    console.log(`Final options for field "${itemData.name}":`, options);

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
        <div class="grid grid-cols-2 gap-2 flex-1">
          <input type="text" 
                 value="" 
                 data-field-attribute="option-label"
                 class="option-input bg-white/5 border border-white/20 rounded-lg py-2 px-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                 placeholder="Display label">
          <input type="text" 
                 value="" 
                 data-field-attribute="option-value"
                 class="option-input bg-white/5 border border-white/20 rounded-lg py-2 px-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                 placeholder="Form value">
        </div>
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

    // Agregar event listeners a los nuevos inputs
    const newOptionItem = optionsList.lastElementChild;
    const labelInput = newOptionItem.querySelector(
      '[data-field-attribute="option-label"]',
    );
    const valueInput = newOptionItem.querySelector(
      '[data-field-attribute="option-value"]',
    );

    labelInput.addEventListener("input", this.boundHandleAttributeChange);
    valueInput.addEventListener("input", this.boundHandleAttributeChange);

    // Focus en el primer input (label)
    labelInput.focus();

    // Actualizar el array de opciones
    const itemId = itemEl.dataset.id;
    const itemInAllItems = this.allItems.find(
      (item) => item.name === itemId || item.id === itemId,
    );
    if (itemInAllItems) {
      this.updateSingleFieldOptions(itemEl, itemInAllItems);
    }
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
      this.updateSingleFieldOptions(itemEl, itemInAllItems);
    }
  }

  // Método para eliminar un campo completo
  deleteField(event) {
    const button = event.target.closest(".delete-field-btn");
    const itemEl = button.closest('[data-drag-target="item"]');
    const itemId = itemEl.dataset.id;

    // Buscar el campo en allItems
    const fieldToDelete = this.allItems.find((item) => item.name === itemId);

    if (!fieldToDelete) {
      this.sendNotification("Error: Campo no encontrado", "error");
      return;
    }

    // Confirmar eliminación
    if (
      confirm(
        `Are you sure you want to delete the field "${fieldToDelete.name}"?\n\nThis action cannot be undone.`,
      )
    ) {
      try {
        // Eliminar del array
        this.allItems = this.allItems.filter((item) => item.name !== itemId);

        // Re-renderizar la página actual (forzar re-render)
        this.isInitialLoad = false; // Asegurar que no es carga inicial
        this.renderCurrentPage();

        // Actualizar el input hidden
        this.updateHiddenInput();

        // Mostrar notificación de éxito usando notification controller
        this.sendNotification(
          `Field "${fieldToDelete.name}" deleted successfully`,
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
        this.sendNotification("Error deleting field", "error");
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
  }

  updateHiddenInput() {
    // No agregar campo position innecesario
    const payload = this.allItems.map((item) => ({
      ...item,
    }));

    if (this.hasInputTarget) {
      this.inputTarget.value = JSON.stringify(payload);
    }
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
    try {
      // Crear el nuevo campo por defecto tipo Deficiency
      const newField = this.createDefaultField();

      // Agregar el campo al array
      this.allItems.push(newField);

      // Ir a la última página si es necesario
      const totalPages = Math.ceil(this.allItems.length / this.itemsPerPage);
      this.currentPage = totalPages;

      // Re-renderizar la página actual
      this.renderCurrentPage();

      // Actualizar el input hidden
      this.updateHiddenInput();

      // Scroll al campo recién agregado
      this.scrollToNewField();

      // Mostrar notificación de éxito usando notification controller
      this.sendNotification(
        `Field "${newField.name}" added successfully`,
        "success",
      );

      // Incrementar contador para el próximo campo
      this.fieldCounter++;
    } catch (error) {
      this.sendNotification("Error adding field", "error");
    }
  }

  // Método para crear un campo por defecto tipo Deficiency
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
      comment_value: "", // Agregar comment_value para Deficiency
      Item: "", // Campo para Item
      Riser: "", // Campo para Riser
      D: "", // Campo oculto para llenar en otra vista
      C: "", // Campo oculto para llenar en otra vista
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

  isFieldNameUnique(fieldName) {
    return !this.allItems.some(
      (item) => item.name === fieldName || item.id === fieldName,
    );
  }
}
