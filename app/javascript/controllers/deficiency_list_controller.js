import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = [
    "list",
    "listContainer",
    "formContainer",
    "input",
    "formTitle",
    "modalItem",
    "modalRiser",
    "modalC",
    "modalD",
    "modalSelect",
    "modalComment",
    "searchableSelectButtonText",
  ];

  static values = {
    defaultItem: String,
  };

  // Initializes the controller, loads initial data, and renders the deficiency list
  connect() {
    this.deficiencies = [];
    this.editingId = null;

    this.loadFromInput();
    this.renderList();
    this.showList();
  }

  // Parses deficiency data from the hidden input field
  loadFromInput() {
    try {
      const rawValue = this.inputTarget.value;
      if (rawValue) {
        this.deficiencies = JSON.parse(rawValue);
        if (!Array.isArray(this.deficiencies)) {
          this.deficiencies = [];
        }
      }
    } catch (e) {
      console.error("Error parsing deficiency data", e);
      this.deficiencies = [];
    }
  }

  // Serializes deficiency data and updates the hidden input field
  updateInput() {
    this.inputTarget.value = JSON.stringify(this.deficiencies);
    // Trigger change event so form_fill_controller detects and saves
    this.inputTarget.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Renders the list of deficiencies into the DOM
  renderList() {
    if (this.deficiencies.length === 0) {
      this.listTarget.innerHTML = `
        <div class="text-center p-4 text-gray-500 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          No deficiencies added yet.
        </div>
      `;
      return;
    }

    this.listTarget.innerHTML = this.deficiencies
      .map(
        (def) => `
      <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-3 relative group">
        <div class="flex justify-between items-start">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="font-bold text-blue-900 text-lg">${def.value || "No Deficiency Selected"}</span>
              ${def.Item ? `<span class="text-xs font-mono bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Item: ${def.Item}</span>` : ""}
              ${def.Riser ? `<span class="text-xs font-mono bg-gray-100 text-gray-800 px-2 py-0.5 rounded">Riser: ${def.Riser}</span>` : ""}
            </div>
            
            <div class="flex gap-2 mb-2">
              ${def.C === "Yes" ? '<span class="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded">C: Yes</span>' : ""}
              ${def.D === "Yes" ? '<span class="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded">D: Yes</span>' : ""}
            </div>

            ${def.comment_value ? `<p class="text-gray-600 text-sm italic">"${def.comment_value}"</p>` : ""}
          </div>
          
          <div class="flex gap-2 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
            <button type="button" 
                    data-action="click->deficiency-list#edit" 
                    data-id="${def.id}"
                    class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            </button>
            <button type="button" 
                    data-action="click->deficiency-list#remove" 
                    data-id="${def.id}"
                    class="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Remove">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          </div>
        </div>
      </div>
    `,
      )
      .join("");
  }

  // Switches the view to the deficiency form for adding or editing
  showForm() {
    this.editingId = null;
    if (this.hasFormTitleTarget) {
      this.formTitleTarget.textContent = "Add Deficiency";
    }
    this.resetForm();
    this.listContainerTarget.classList.add("hidden");
    this.formContainerTarget.classList.remove("hidden");
  }

  // Switches the view back to the list of deficiencies
  showList() {
    this.formContainerTarget.classList.add("hidden");
    this.listContainerTarget.classList.remove("hidden");
    this.resetForm();
  }

  // Saves a new or modified deficiency to the list
  saveDeficiency() {
    const deficiency = {
      id: this.editingId || this.generateId(),
      Item: this.modalItemTarget.value,
      Riser: this.modalRiserTarget.value,
      C: this.modalCTarget.checked ? "Yes" : "No",
      D: this.modalDTarget.checked ? "Yes" : "No",
      value: this.modalSelectTarget.value, // The hidden select value
      comment_value: this.modalCommentTarget.value,
    };

    // Validar requeridos básicos si es necesario
    if (!deficiency.value && !deficiency.comment_value) {
      alert("Please select a deficiency or add a comment");
      return;
    }

    if (this.editingId) {
      const index = this.deficiencies.findIndex((d) => d.id === this.editingId);
      if (index !== -1) {
        this.deficiencies[index] = deficiency;
      }
    } else {
      this.deficiencies.push(deficiency);
    }

    this.updateInput();
    this.renderList();
    this.showList();
  }

  // Prepares the form for editing an existing deficiency
  edit(event) {
    const id = event.currentTarget.dataset.id;
    const deficiency = this.deficiencies.find((d) => d.id === id);

    if (!deficiency) return;

    this.editingId = id;
    if (this.hasFormTitleTarget) {
      this.formTitleTarget.textContent = "Edit Deficiency";
    }

    this.modalItemTarget.value = deficiency.Item || "";
    this.modalRiserTarget.value = deficiency.Riser || "";
    this.modalCTarget.checked = deficiency.C === "Yes";
    this.modalDTarget.checked = deficiency.D === "Yes";
    this.modalCommentTarget.value = deficiency.comment_value || "";

    this.modalSelectTarget.value = deficiency.value || "";

    if (this.hasSearchableSelectButtonTextTarget) {
      this.searchableSelectButtonTextTarget.textContent =
        deficiency.value || "Select an option";
    }

    this.listContainerTarget.classList.add("hidden");
    this.formContainerTarget.classList.remove("hidden");
  }

  // Removes a deficiency from the list
  remove(event) {
    if (!confirm("Are you sure you want to remove this deficiency?")) return;

    const id = event.currentTarget.dataset.id;
    this.deficiencies = this.deficiencies.filter((d) => d.id !== id);
    this.updateInput();
    this.renderList();
  }

  // Resets the form fields to their default values
  resetForm() {
    this.modalItemTarget.value = this.hasDefaultItemValue
      ? this.defaultItemValue
      : "";
    this.modalRiserTarget.value = "";
    this.modalCTarget.checked = false;
    this.modalDTarget.checked = false;
    this.modalSelectTarget.value = "";
    if (this.hasSearchableSelectButtonTextTarget) {
      this.searchableSelectButtonTextTarget.textContent = "Select an option";
    }
    this.modalCommentTarget.value = "";
  }

  // Generates a unique ID for a deficiency
  generateId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}
