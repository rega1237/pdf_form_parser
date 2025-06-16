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
    this.itemsPerPage = 50; // Adjust as needed
    this.currentPage = 1;
    this.allItems = [];

    // Initial population of allItems from the DOM elements rendered by ERB
    // These elements are expected to have data-id and data-field-type, etc.
    const initialItems = Array.from(this.element.querySelectorAll('[data-drag-target="item"]'));
    this.allItems = initialItems.map((itemEl) => {
      return this.extractItemData(itemEl);
    });

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

  disconnect() {
    if (this.sortable) {
      this.sortable.destroy();
    }
  }

  extractItemData(itemEl) {
    const fieldName = itemEl.dataset.id;
    const fieldType = itemEl.dataset.fieldType; // Ensure this is added in ERB
    const labelNameInput = itemEl.querySelector('[data-field-attribute="label_name"]');
    const sectionNameInput = itemEl.querySelector('[data-field-attribute="section_name"]');
    const pageNumberInput = itemEl.querySelector('[data-field-attribute="page_number"]');
    const columnWidthInput = itemEl.querySelector('[data-field-attribute="column_width"]');
    const requiredInput = itemEl.querySelector('[data-field-attribute="required"]');

    return {
      id: fieldName,
      type: fieldType,
      label_name: labelNameInput ? labelNameInput.value : "",
      section_name: sectionNameInput ? sectionNameInput.value : "",
      page_number: pageNumberInput ? pageNumberInput.value : "",
      column_width: columnWidthInput ? columnWidthInput.value : "3", // Default to 3 if not set
      required: requiredInput ? requiredInput.checked : false,
    };
  }

  renderCurrentPage() {
    if (!this.listTarget) return;

    this.listTarget.innerHTML = ''; // Clear existing items

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
    // This function reconstructs the HTML for a single field item.
    // It should mirror the structure in form_builder.html.erb for a field item.
    // This is a simplified example; you'll need to match your ERB structure exactly.
    const element = document.createElement('div');
    element.classList.add('field-item', 'bg-white/10', 'backdrop-blur-sm', 'rounded-2xl', 'p-6', 'border', 'border-white/20', 'shadow-lg');
    element.dataset.dragTarget = 'item';
    element.dataset.id = itemData.id;
    element.dataset.fieldType = itemData.type;

    // Unique IDs for labels and inputs based on globalIndex or itemData.id to avoid collisions
    const fieldIdBase = `field_${itemData.id.replace(/\W/g, '_')}_${globalIndex}`;

    element.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
        <div class="flex items-center mb-2 sm:mb-0">
          <span class="handle text-slate-400 hover:text-indigo-400 mr-4 text-xl transition-colors duration-200">☰</span>
          <div>
            <span class="font-semibold text-white text-lg">${itemData.id}</span>
            <span class="text-indigo-300 text-sm ml-3 bg-indigo-500/20 px-2 py-1 rounded-lg">
              ${itemData.type}
            </span>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-white/10">
        <div>
          <label for="${fieldIdBase}_label_name" class="block text-white font-semibold text-sm">Custom Label</label>
          <input type="text" id="${fieldIdBase}_label_name" value="${itemData.label_name}" data-field-attribute="label_name" class="w-full bg-white/5 border border-white/20 rounded-xl py-3 px-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200" placeholder="Enter custom label">
        </div>
        <div>
          <label for="${fieldIdBase}_section_name" class="block text-white font-semibold text-sm">Section Name</label>
          <input type="text" id="${fieldIdBase}_section_name" value="${itemData.section_name}" data-field-attribute="section_name" class="w-full bg-white/5 border border-white/20 rounded-xl py-3 px-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200" placeholder="Enter section name">
        </div>
        <div>
          <label for="${fieldIdBase}_page_number" class="block text-white font-semibold text-sm">Page Number</label>
          <input type="number" id="${fieldIdBase}_page_number" value="${itemData.page_number}" data-field-attribute="page_number" class="w-full bg-white/5 border border-white/20 rounded-xl py-3 px-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200" placeholder="Page">
        </div>
        <div>
          <label for="${fieldIdBase}_column_width" class="block text-white font-semibold text-sm">Column Width (1-9)</label>
          <input type="number" id="${fieldIdBase}_column_width" value="${itemData.column_width || 3}" data-field-attribute="column_width" min="1" max="9" class="w-full bg-white/5 border border-white/20 rounded-xl py-3 px-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200" placeholder="3">
        </div>
        <div class="flex items-center space-x-3 lg:col-span-4 mt-2">
          <input type="checkbox" id="${fieldIdBase}_required" ${itemData.required ? 'checked' : ''} data-field-attribute="required" class="w-5 h-5 text-indigo-600 bg-white/10 border-white/20 rounded focus:ring-indigo-500 focus:ring-2">
          <label for="${fieldIdBase}_required" class="text-white font-medium">Required Field</label>
        </div>
      </div>
    `;
    return element;
  }

  addEventListenersToPageItems() {
    this.itemTargets.forEach((itemEl) => {
      const attributeInputs = itemEl.querySelectorAll("[data-field-attribute]");
      attributeInputs.forEach((input) => {
        // Remove old listener before adding new one to prevent duplicates if called multiple times
        input.removeEventListener("input", this.handleAttributeChange.bind(this)); 
        input.addEventListener("input", this.handleAttributeChange.bind(this));
      });
    });
  }

  handleAttributeChange(event) {
    const changedInput = event.target;
    const itemEl = changedInput.closest('[data-drag-target="item"]');
    const itemId = itemEl.dataset.id;
    const attributeName = changedInput.dataset.fieldAttribute;

    const itemInAllItems = this.allItems.find(item => item.id === itemId);
    if (itemInAllItems) {
      if (changedInput.type === 'checkbox') {
        itemInAllItems[attributeName] = changedInput.checked;
      } else {
        itemInAllItems[attributeName] = changedInput.value;
      }
      this.updateHiddenInput();
    }
  }

  onSortEnd(event) {
    const { oldIndex, newIndex, item } = event;
    const itemId = item.dataset.id;

    // Calculate global indices based on current page
    const globalOldIndex = (this.currentPage - 1) * this.itemsPerPage + oldIndex;
    const globalNewIndex = (this.currentPage - 1) * this.itemsPerPage + newIndex;

    // Update allItems array
    const movedItem = this.allItems.find(i => i.id === itemId);
    if (!movedItem) return;

    // Temporarily remove from array to correctly calculate new position if item moved within same page
    const tempAllItems = this.allItems.filter(i => i.id !== itemId);
    
    // Find the actual item that was at globalOldIndex before this item was picked up
    // This is tricky because SortableJS gives indices relative to the current DOM state.
    // A simpler way: find the item in allItems, remove it, then insert it at the new global position.
    
    const itemToMoveIndex = this.allItems.findIndex(i => i.id === itemId);
    if (itemToMoveIndex === -1) return; // Should not happen

    const [itemActualToMove] = this.allItems.splice(itemToMoveIndex, 1);
    
    // The newIndex from SortableJS is within the paginated view.
    // We need to insert it relative to the items on the current page, then map to global.
    // Or, more directly, calculate the target global index.
    // If item is dragged from globalOldIndex to globalNewIndex:
    this.allItems.splice(globalNewIndex, 0, itemActualToMove);

    this.updateHiddenInput();
    this.renderCurrentPage(); // Re-render to reflect sort on current page and maintain consistency
  }

  updateHiddenInput() {
    const payload = this.allItems.map((item, index) => ({
      ...item,
      position: index, // Server expects position
    }));

    if (this.hasInputTarget) {
      this.inputTarget.value = JSON.stringify(payload);
    }
    // console.log("Updated hidden input with all items:", payload);
  }

  updatePaginationControls() {
    if (!this.hasPageInfoTarget) return;

    const totalPages = Math.ceil(this.allItems.length / this.itemsPerPage);
    this.pageInfoTarget.textContent = `Page ${this.currentPage} of ${totalPages || 1}`;

    if (this.hasPrevButtonTarget) {
      this.prevButtonTarget.disabled = this.currentPage === 1;
    }
    if (this.hasNextButtonTarget) {
      this.nextButtonTarget.disabled = this.currentPage === totalPages || totalPages === 0;
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
}
