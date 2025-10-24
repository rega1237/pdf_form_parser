import { Controller } from "@hotwired/stimulus";
import OfflineStorage from "utils/offline_storage";

export default class extends Controller {
  static targets = ["formStructure"];
  static values = {
    formStructure: String,
    formFields: String,
    data: Object,
    inspectionDate: String,
    id: Number,
  };

  connect() {
    // Initialize change tracking for incremental updates
    this.changedFields = new Map();
    this.debouncedSave = this.debounce(
      this.saveDraftIncremental.bind(this),
      3000,
    );
    this.offlineStorage = new OfflineStorage();
    console.log(this.offlineStorage)

    // Prevent double-submit when both touchstart and click fire
    this._pdfSubmitting = false;

    // Offline-First: Inicializar estructura+datos desde IndexedDB
    this.initializeFromIndexedDB()

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

  // Cargar estructura y datos desde IndexedDB; fallback al servidor solo si es necesario
  async initializeFromIndexedDB() {
    try {
      const formId = this.element.action.split("/").pop().split("?")[0];
      const numericFormId = parseInt(formId, 10);
      if (!numericFormId) return;

      const ff = await this.offlineStorage.getFormFillData(numericFormId);
      if (ff) {
        // Set structure and data on dataset for downstream consumers,
        // evitando doble codificación si vienen como strings JSON.
        try {
          const fs = ff.form_structure;
          let structureJSONString = "[]";
          if (typeof fs === "string") {
            // Ya es JSON string
            structureJSONString = fs;
          } else if (Array.isArray(fs)) {
            structureJSONString = JSON.stringify(fs);
          } else if (fs && typeof fs === "object") {
            const arr = Array.isArray(fs.fields)
              ? fs.fields
              : Array.isArray(fs.form_fields)
                ? fs.form_fields
                : Array.isArray(fs.structure)
                  ? fs.structure
                  : null;
            structureJSONString = JSON.stringify(arr || []);
          }
          this.element.dataset.formFillFormStructureValue = structureJSONString;
        } catch (e) {
          console.warn("[form_fill_controller] Failed to normalize form_structure: ", e);
          this.element.dataset.formFillFormStructureValue = "[]";
        }

        try {
          const dataObj = ff.data;
          let dataJSONString = "{}";
          if (typeof dataObj === "string") {
            // Ya es JSON string
            dataJSONString = dataObj;
          } else {
            dataJSONString = JSON.stringify(dataObj || {});
          }
          this.element.dataset.formFillDataValue = dataJSONString;
        } catch (e) {
          console.warn("[form_fill_controller] Failed to normalize data: ", e);
          this.element.dataset.formFillDataValue = "{}";
        }

        // Ensure inspection date is available to date-fix controller when offline
        try {
          // Only set from IndexedDB if not already provided by server-side data attribute
          if (!this.element.dataset.formFillInspectionDateValue) {
            // Try to get inspection date from the stored form_fill or its inspection
            let rawDate = null;
            // Some payloads may include inspection_date directly on the form_fill
            if (ff.inspection_date) {
              rawDate = ff.inspection_date;
            } else if (ff.inspection_id) {
              try {
                const inspection = await this.offlineStorage.getInspection(ff.inspection_id);
                rawDate = inspection?.date || inspection?.inspection_date || null;
              } catch (e) {
                console.warn("[form_fill_controller] Failed to retrieve inspection from IndexedDB:", e);
              }
            }

            // Normalize raw date to MM/DD/YYYY for date-fix controller
            const toUSDate = (d) => {
              if (!d) return null;
              if (typeof d === "string") {
                const isoMatch = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
                if (isoMatch) {
                  const y = isoMatch[1];
                  const m = isoMatch[2];
                  const day = isoMatch[3];
                  return `${m}/${day}/${y}`;
                }
                // Already US format?
                if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) return d;
                // Try Date.parse fallback
                const parsed = new Date(d);
                if (!isNaN(parsed.getTime())) {
                  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
                  const dd = String(parsed.getDate()).padStart(2, "0");
                  const yyyy = String(parsed.getFullYear());
                  return `${mm}/${dd}/${yyyy}`;
                }
                return null;
              } else if (d instanceof Date) {
                const mm = String(d.getMonth() + 1).padStart(2, "0");
                const dd = String(d.getDate()).padStart(2, "0");
                const yyyy = String(d.getFullYear());
                return `${mm}/${dd}/${yyyy}`;
              }
              return null;
            };

            const usDate = toUSDate(rawDate);
            if (usDate) {
              this.element.dataset.formFillInspectionDateValue = usDate;
            }
          }
        } catch (e) {
          console.warn("[form_fill_controller] Failed to set inspection date dataset from IndexedDB:", e);
        }

        const hiddenInput = document.getElementById("form_fill_form_structure");
        if (hiddenInput) {
          hiddenInput.value = this.element.dataset.formFillFormStructureValue;
        }

        // Render with local data immediately (optimistic)
        this.loadFormValues();
      } else {
        // No local data found; attempt server fetch only if online
        if (navigator.onLine) {
          await this.syncPhotoStructure();
        } else {
          console.warn("[form_fill_controller] No local form_fill and offline; cannot load structure.");
        }
      }
    } catch (error) {
      console.error("[form_fill_controller] Error initializing from IndexedDB:", error);
      // As a last resort, try server if online
      if (navigator.onLine) {
        await this.syncPhotoStructure();
      }
    }
  }

  get csrfToken() {
    return document.querySelector('meta[name="csrf-token"]').content;
  }

  // Setup tracking for Pass/Fail fields
  setupPassFailTracking() {
    // Find all Pass/Fail hidden inputs
    const passFailInputs = this.element.querySelectorAll(
      'input[type="hidden"][id^="hidden_input_"]',
    );

    passFailInputs.forEach((hiddenInput) => {
      // Create a MutationObserver to watch for value changes
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (
            mutation.type === "attributes" &&
            mutation.attributeName === "value"
          ) {
            this.handlePassFailChange(hiddenInput);
          }
        });
      });

      // Start observing
      observer.observe(hiddenInput, {
        attributes: true,
        attributeFilter: ["value"],
      });

      // Also listen for direct value property changes
      const originalValue = hiddenInput.value;
      Object.defineProperty(hiddenInput, "value", {
        get() {
          return this.getAttribute("value") || "";
        },
        set(newValue) {
          if (this.getAttribute("value") !== newValue) {
            this.setAttribute("value", newValue);
            // Trigger our change handler
            setTimeout(() => {
              const event = new Event("passfail-change", { bubbles: true });
              this.dispatchEvent(event);
            }, 0);
          }
        },
      });

      // Listen for the custom event
      hiddenInput.addEventListener("passfail-change", () => {
        this.handlePassFailChange(hiddenInput);
      });
    });

    // Also listen for choice-buttons events (if they dispatch custom events)
    this.element.addEventListener("choice-selected", (event) => {
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
      const fieldValue = hiddenInput.value || "";
      const currentValue = this.changedFields.get(fieldName);

      console.log(
        `Pass/Fail change detected - Field: ${fieldName}, Value: ${fieldValue}`,
      );

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
    if (id.startsWith("hidden_input_")) {
      // Try to find the corresponding form field
      const choiceButtonGroup = hiddenInput.closest(
        '[data-controller*="choice-buttons"]',
      );
      if (choiceButtonGroup) {
        const hiddenInputId = choiceButtonGroup.dataset.hiddenInputId;
        if (hiddenInputId) {
          // Extract field name from the hidden input ID
          const match = hiddenInputId.match(/hidden_input_(.+)/);
          if (match) {
            // Convert back to form field name format
            return match[1].replace(/^form_data_/, "").replace(/_[^_]+$/, "");
          }
        }
      }
    }
    return null;
  }

  // Update field validation status
  updateFieldValidation(fieldName, fieldValue) {
    // Find the field container
    const fieldContainer = this.element.querySelector(
      `[data-field-name="${fieldName}"]`,
    );
    if (fieldContainer) {
      const isRequired = fieldContainer.dataset.required === "true";
      const hasValue = fieldValue && fieldValue.trim() !== "";

      // Update validation state
      if (isRequired) {
        fieldContainer.classList.toggle("field-valid", hasValue);
        fieldContainer.classList.toggle("field-invalid", !hasValue);
      }

      // Trigger pagination validation update
      const event = new CustomEvent("field-validation-changed", {
        bubbles: true,
        detail: { fieldName, hasValue, isRequired },
      });
      this.element.dispatchEvent(event);
    }
  }

  // Método para sincronizar la estructura del formulario con fotos existentes
  async syncPhotoStructure() {
    try {
      // Primero intentar cargar desde IndexedDB
      const formId = this.element.action.split("/").pop().split("?")[0];
      const numericFormId = parseInt(formId, 10);
      if (numericFormId) {
        const ff = await this.offlineStorage.getFormFillData(numericFormId);
        if (ff && ff.form_structure) {
          this.element.dataset.formFillFormStructureValue = JSON.stringify(ff.form_structure);
          const hiddenInput = document.getElementById("form_fill_form_structure");
          if (hiddenInput) {
            hiddenInput.value = this.element.dataset.formFillFormStructureValue;
          }
          this.loadFormValues();
          return;
        }
      }

      // Fallback: si no existe en IndexedDB y estamos online, pedir al servidor
      if (navigator.onLine) {
        const response = await fetch(`/form_fills/${numericFormId}/structure`, {
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
      } else {
        console.warn("[form_fill_controller] No form_structure in IndexedDB and offline; skipping.");
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
    // Parse form structure robustly, handling potential double-encoded JSON or object containers
    let formStructureData = [];
    try {
      const raw = this.element.dataset.formFillFormStructureValue || "[]";
      let parsed = JSON.parse(raw);
      if (typeof parsed === "string") {
        try {
          parsed = JSON.parse(parsed);
        } catch (e) {
          console.warn("[form_fill_controller] Double-encoded structure string failed to parse:", e);
        }
      }
      if (Array.isArray(parsed)) {
        formStructureData = parsed;
      } else if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.fields)) {
          formStructureData = parsed.fields;
        } else if (Array.isArray(parsed.form_fields)) {
          formStructureData = parsed.form_fields;
        } else if (Array.isArray(parsed.structure)) {
          formStructureData = parsed.structure;
        } else {
          formStructureData = [];
        }
      }
    } catch (e) {
      console.warn("[form_fill_controller] Could not parse form structure:", e);
      formStructureData = [];
    }

    const formElements = this.element.elements;

    // Fallback: if structure is not an array, populate fields directly from data
    if (!Array.isArray(formStructureData) || formStructureData.length === 0) {
      console.warn("[form_fill_controller] Form structure is empty or invalid. Falling back to data-only population.");
      try {
        Object.keys(dataFromColumn || {}).forEach((name) => {
          const inputElement = formElements[`form_fill[${name}]`];
          const value = dataFromColumn[name];
          if (!inputElement) return;

          if (inputElement.type === "file") {
            // Without structure, we can't infer attachment IDs; skip.
            return;
          } else if (
            inputElement.type === "checkbox" ||
            inputElement.type === "radio"
          ) {
            inputElement.checked =
              value === inputElement.value || value === true || value === "true";
          } else {
            inputElement.value = value || "";
          }
        });

        // Attempt to set pass/fail hidden fields if present
        Object.keys(dataFromColumn || {}).forEach((name) => {
          const value = dataFromColumn[name];
          if (value !== undefined && value !== null) {
            this.loadPassFailField(name, value);
          }
        });

        this.initializeDateFields();
      } catch (e) {
        console.warn("[form_fill_controller] Fallback population failed:", e);
      }
      return;
    }

    // Normal path: we have a valid structure array
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
              const valueFromData = dataFromColumn[field.name];
              if (valueFromData !== undefined && valueFromData !== null) {
                inputElement.checked =
                  valueFromData === inputElement.value ||
                  valueFromData === true ||
                  valueFromData === "true";
              } else {
                inputElement.checked =
                  field.value === inputElement.value ||
                  field.value === true ||
                  field.value === "true";
              }
          } else {
            // Handle date fields with inspection date
            if (field.type === "Date") {
              if (inputElement.dataset.controller.includes("datepicker")) {
                const valueFromData = dataFromColumn[field.name];
                const finalValue = valueFromData || field.value || "";
                inputElement.value = finalValue;
                inputElement.setAttribute("value", finalValue);
              } else {
                this.loadDateField(inputElement, field);
              }
            } else {
              const valueFromData = dataFromColumn[field.name];
              const finalValue =
                valueFromData !== undefined && valueFromData !== null
                  ? valueFromData
                  : field.value || "";
              inputElement.value = finalValue;
              inputElement.setAttribute("value", finalValue);
            }
            }
          }
        }

        if (field.type === "Deficiency") {
          // Prefer values from data column (offline/online), fallback to structure
          const selectElement = formElements[`form_fill[${field.name}_select]`];
          const selectFromData = dataFromColumn?.[`${field.name}_select`];
          const finalSelectValue = (selectFromData !== undefined && selectFromData !== null)
            ? selectFromData
            : (field.select || field.value || "");
          if (selectElement) {
            selectElement.value = finalSelectValue;
            selectElement.setAttribute("value", finalSelectValue);
          }

          // Update the searchable-select display if it exists
          const searchableSelectContainer = this.element
            .querySelector(
              `[data-controller*="searchable-select"] input[id*="${field.name}_select"]`,
            )
            ?.closest('[data-controller*="searchable-select"]');
          if (searchableSelectContainer) {
            const buttonText = searchableSelectContainer.querySelector(
              '[data-searchable-select-target="buttonText"]',
            );
            if (buttonText) {
              buttonText.textContent = finalSelectValue || "Select an option";
            }
          }

          // Comment
          const commentElement = formElements[`form_fill[${field.name}_comment]`];
          const commentFromData = dataFromColumn?.[`${field.name}_comment`];
          const finalComment = (commentFromData !== undefined && commentFromData !== null)
            ? commentFromData
            : (field.comment_value || "");
          if (commentElement) {
            commentElement.value = finalComment;
            commentElement.setAttribute("value", finalComment);
          }

          // Item
          const itemElement = formElements[`form_fill[${field.name}_item]`];
          const itemFromData = dataFromColumn?.[`${field.name}_item`];
          const finalItem = (itemFromData !== undefined && itemFromData !== null)
            ? itemFromData
            : (field.Item || "");
          if (itemElement) {
            itemElement.value = finalItem;
            itemElement.setAttribute("value", finalItem);
          }

          // Riser
          const riserElement = formElements[`form_fill[${field.name}_riser]`];
          const riserFromData = dataFromColumn?.[`${field.name}_riser`];
          const finalRiser = (riserFromData !== undefined && riserFromData !== null)
            ? riserFromData
            : (field.Riser || "");
          if (riserElement) {
            riserElement.value = finalRiser;
            riserElement.setAttribute("value", finalRiser);
          }

          // C checkbox (note: deficiency C/D checkboxes are not in form_fill[], use plain names)
          const cElement = formElements[`${field.name}_c`];
          const cFromData = dataFromColumn?.[`${field.name}_c`];
          if (cElement) {
            const cChecked = (cFromData !== undefined && cFromData !== null)
              ? (cFromData === cElement.value || cFromData === true || cFromData === "true" || cFromData === "Yes")
              : (field.C === "Yes" || field.C === true);
            cElement.checked = !!cChecked;
          }

          // D checkbox
          const dElement = formElements[`${field.name}_d`];
          const dFromData = dataFromColumn?.[`${field.name}_d`];
          if (dElement) {
            const dChecked = (dFromData !== undefined && dFromData !== null)
              ? (dFromData === dElement.value || dFromData === true || dFromData === "true" || dFromData === "Yes")
              : (field.D === "Yes" || field.D === true);
            dElement.checked = !!dChecked;
          }
        }
      }
    });

    // Initialize date fields with inspection date after loading all values
    this.initializeDateFields();
  }

  // Initialize all date fields with inspection date if they're empty
  initializeDateFields() {
    // Cargar datos ya existentes para evitar reinsertar fechas que ya están guardadas
    const dataFromColumn = this.getDataFromColumn() || {};

    // Buscar todos los campos de fecha controlados por date-fix
    const dateFields = this.element.querySelectorAll(
      'input[data-controller*="date-fix"]',
    );

    dateFields.forEach((dateField) => {
      // Resolver nombre del campo (clave en dataFromColumn)
      const fieldName = this.extractFieldNameFromInput(dateField);

      // Intentar recuperar valor ya guardado desde datos (offline/online)
      const savedValue = fieldName ? dataFromColumn[fieldName] : null;

      // Si el valor ya está guardado y el input está vacío, poblar SIN marcar cambios
      if ((!dateField.value || dateField.value.trim() === "") && savedValue) {
        let valueToSet = savedValue;
        // Normalizar posibles valores ISO a formato US
        if (typeof valueToSet === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valueToSet)) {
          const [y, m, d] = valueToSet.split("-");
          valueToSet = `${m}/${d}/${y}`;
        }
        dateField.value = valueToSet;
        dateField.setAttribute("value", valueToSet);
        // No disparamos eventos ni marcamos changedFields: ya existe en datos
        return;
      }

      // Si el campo sigue vacío, delegar en date-fix (usa fecha de inspección o actual)
      const dateFixController =
        this.application?.getControllerForElementAndIdentifier(
          dateField,
          "date-fix",
        );

      if ((!dateField.value || dateField.value.trim() === "") && dateFixController?.setInspectionDateIfEmpty) {
        // Esto disparará eventos input/change y será capturado por changedFields
        dateFixController.setInspectionDateIfEmpty();
      } else if (!dateField.value || dateField.value.trim() === "") {
        // Fallback sin controlador: usar fecha de inspección si existe o la fecha actual
        const inspectionDate = this.getFormattedInspectionDate();
        let valueToSet = inspectionDate;
        if (!valueToSet) {
          const today = new Date();
          const month = String(today.getMonth() + 1).padStart(2, "0");
          const day = String(today.getDate()).padStart(2, "0");
          const year = today.getFullYear();
          valueToSet = `${month}/${day}/${year}`;
        }
        dateField.value = valueToSet;
        dateField.setAttribute("value", valueToSet);

        // Marcar cambio para guardado incremental sólo cuando establecemos por defecto
        if (fieldName) {
          this.changedFields.set(fieldName, valueToSet);
        }
      }
    });

    // Guardar sólo si hubo cambios reales en esta inicialización
    if (this.changedFields.size > 0) {
      this.debouncedSave();
    }
  }

  // Return inspection date in MM/DD/YYYY format (already provided by the server or normalized when offline)
  getFormattedInspectionDate() {
    if (!this.inspectionDateValue) return null;
    // Expect MM/DD/YYYY; if not, return as-is. Conversion handled earlier when setting dataset.
    return this.inspectionDateValue;
  }

  // Get data from the data column
  getDataFromColumn() {
    try {
      console.log("Getting data from column...");

      // Try to get data from Rails via a global variable or data attribute
      if (window.formFillData) {
        try {
          const g = window.formFillData;
          const parsedGlobal = typeof g === "string" ? JSON.parse(g) : g;
          console.log("Using window.formFillData:", parsedGlobal);
          return parsedGlobal;
        } catch (e) {
          console.warn("[form_fill_controller] Failed to parse window.formFillData:", e);
          return {};
        }
      }

      // Try to get from form element data attribute
      const dataValue = this.element.dataset.formFillDataValue;
      if (dataValue) {
        console.log("Found data value attribute:", dataValue);
        let parsedData = {};
        try {
          parsedData = JSON.parse(dataValue);
          if (typeof parsedData === "string") {
            try {
              parsedData = JSON.parse(parsedData);
            } catch (e) {
              console.warn("[form_fill_controller] Double-encoded data string failed to parse:", e);
            }
          }
        } catch (e) {
          console.warn("[form_fill_controller] Failed to parse dataValue:", e);
          parsedData = {};
        }
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
      `input[type="hidden"][id^="hidden_input"][id*="${fieldName}"]`,
    ];

    for (const selector of possibleSelectors) {
      hiddenInput = this.element.querySelector(selector);
      if (hiddenInput) {
        break;
      }
    }

    // Method 2: Find by looking for the field container first
    if (!hiddenInput) {
      const fieldContainer = this.element.querySelector(
        `[data-field-name="${fieldName}"]`,
      );
      if (fieldContainer) {
        hiddenInput = fieldContainer.querySelector('input[type="hidden"]');
      }
    }

    // Method 3: Find by choice-button-group and data attribute
    if (!hiddenInput) {
      const choiceGroups = this.element.querySelectorAll(
        '[data-controller*="choice-buttons"]',
      );
      choiceGroups.forEach((group) => {
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
      const choiceButtonGroup =
        hiddenInput.closest('[data-controller*="choice-buttons"]') ||
        hiddenInput.parentElement.closest(
          '[data-controller*="choice-buttons"]',
        ) ||
        this.element.querySelector(
          `[data-hidden-input-id="${hiddenInput.id}"]`,
        );

      if (choiceButtonGroup) {
        // Find all buttons in this group
        const buttons = choiceButtonGroup.querySelectorAll(
          ".choice-button, .radio-choice-button",
        );

        buttons.forEach((button) => {
          const buttonValue = button.dataset.value;
          const isSelected = buttonValue === value;

          if (isSelected) {
            // Select this button
            if (button.classList.contains("radio-choice-button")) {
              this.selectRadioButton(button);
            } else {
              // Handle regular choice-button
              button.classList.add("selected");
            }
          } else {
            // Deselect this button
            if (button.classList.contains("radio-choice-button")) {
              this.deselectRadioButton(button);
            } else {
              // Handle regular choice-button
              button.classList.remove("selected");
            }
          }
        });

        // Force trigger the choice-buttons controller to update
        setTimeout(() => {
          const choiceController =
            this.getChoiceButtonsController(choiceButtonGroup);
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
        return this.application.getControllerForElementAndIdentifier(
          element,
          "choice-buttons",
        );
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
      "from-slate-100",
      "to-slate-200",
      "border-slate-400",
      "text-slate-900",
      "hover:from-slate-200",
      "hover:to-slate-300",
      "hover:border-slate-500",
      "hover:-translate-y-0.5",
      "hover:shadow-lg",
    );

    // Agregar clases de estado seleccionado
    button.classList.add(
      "from-blue-600",
      "to-blue-700",
      "border-blue-900",
      "text-white",
      "shadow-xl",
    );

    // Actualizar el indicador del círculo interno
    const radioIndicator = button.querySelector(".radio-indicator div");
    if (radioIndicator) {
      radioIndicator.classList.remove("opacity-0");
      radioIndicator.classList.add("opacity-100");
    }

    // Actualizar data-selected attribute
    button.dataset.selected = "true";
  }

  // Deselect radio button (duplicate from choice-buttons for consistency)
  deselectRadioButton(button) {
    // Remover clases de estado seleccionado
    button.classList.remove(
      "from-blue-600",
      "to-blue-700",
      "border-blue-900",
      "text-white",
      "shadow-xl",
    );

    // Agregar clases de estado no seleccionado
    button.classList.add(
      "from-slate-100",
      "to-slate-200",
      "border-slate-400",
      "text-slate-900",
      "hover:from-slate-200",
      "hover:to-slate-300",
      "hover:border-slate-500",
      "hover:-translate-y-0.5",
      "hover:shadow-lg",
    );

    // Actualizar el indicador del círculo interno
    const radioIndicator = button.querySelector(".radio-indicator div");
    if (radioIndicator) {
      radioIndicator.classList.remove("opacity-100");
      radioIndicator.classList.add("opacity-0");
    }

    // Actualizar data-selected attribute
    button.dataset.selected = "false";
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


  // Load date field with inspection date as default
  loadDateField(inputElement, field) {
    // Priority: 1. Saved value from data (dataFromColumn), 2. Saved value from structure, 3. Inspection date, 4. Empty
    const fieldName = this.extractFieldNameFromInput(inputElement);
    const dataFromColumn = this.getDataFromColumn() || {};

    // Prefer saved value from the data column over structure
    let savedValue = null;
    if (fieldName && dataFromColumn && dataFromColumn[fieldName]) {
      savedValue = dataFromColumn[fieldName];
    } else if (field && field.value) {
      savedValue = field.value;
    }

    const inspectionDate = this.getFormattedInspectionDate();

    if (savedValue && String(savedValue).trim() !== "") {
      // Normalizar posibles valores ISO a formato US
      let valueToSet = savedValue;
      if (typeof valueToSet === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valueToSet)) {
        const [y, m, d] = valueToSet.split("-");
        valueToSet = `${m}/${d}/${y}`;
      }
      // Use saved value if it exists (no change tracking)
      inputElement.value = valueToSet;
      inputElement.setAttribute("value", valueToSet);
      return;
    } else if (inspectionDate) {
      // Use inspection date as default if no saved value
      inputElement.value = inspectionDate;
      inputElement.setAttribute("value", inspectionDate);

      // Also update the data to reflect this default
      if (fieldName) {
        this.changedFields.set(fieldName, inspectionDate);
        // Trigger debounced save to persist the default value
        this.debouncedSave();
      }
    } else {
      // No inspection date available, leave empty
      inputElement.value = "";
      inputElement.setAttribute("value", "");
    }
  }

  // Extract field name from input element
  extractFieldNameFromInput(inputElement) {
    if (inputElement.name && inputElement.name.startsWith("form_fill[")) {
      const match = inputElement.name.match(/form_fill\[(.+)\]/);
      return match ? match[1] : null;
    }
    return null;
  }

  // Set up field change tracking for incremental saves
  setupFieldChangeTracking() {
    const formElements = this.element.elements;

    Array.from(formElements).forEach((element) => {
      if (element.name && element.name.startsWith("form_fill[")) {
        // Skip file inputs: they are managed by offline-photo controller to avoid storing fake paths
        if (element.type === "file") return;
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
    // Guard: ignore file inputs so we don't persist browser fake paths (e.g., C:\\fakepath\\file.png)
    if (element.type === "file") return;
    const fieldName = this.extractFieldName(element);

    if (fieldName) {
      const fieldValue = this.getElementValue(element);
      const currentValue = this.changedFields.get(fieldName);

      // Only track if value actually changed
      if (currentValue !== fieldValue) {
        this.changedFields.set(fieldName, fieldValue);

        // Si el campo que cambió es un checkbox 'C' o 'D' de una deficiencia...
        if (fieldName.endsWith("_c") || fieldName.endsWith("_d")) {
          // ... y si el checkbox fue marcado (no desmarcado).
          if (element.checked) {
            const fieldContainer = element.closest(
              '[data-field-type="Deficiency"]',
            );
            if (fieldContainer) {
              const sectionName = fieldContainer.dataset.sectionName;
              // Obtener el nombre base del campo (ej: "deficiency field 200")
              const baseFieldName = fieldName.replace(/_c$|_d$/, "");

              if (sectionName && baseFieldName) {
                const itemNumber =
                  this.extractItemNumberFromSection(sectionName);

                // Si encontramos un número de ítem, lo guardamos.
                if (itemNumber) {
                  const itemFieldName = `${baseFieldName}_item`;
                  this.changedFields.set(itemFieldName, itemNumber);
                  console.log(
                    `[Auto-Item] Se añadió automáticamente el ítem: { "${itemFieldName}": "${itemNumber}" }`,
                  );
                }
              }
            }
          }
        }
        // Trigger debounced save
        this.debouncedSave();
      }
    }
  }

  updateIntervalCategory(event) {
    // Encuentra el contenedor principal para este campo específico
    const fieldContainer = event.target.closest(".space-y-4");
    if (!fieldContainer) return;

    // Dentro de ese contenedor, encuentra el campo oculto y todas las casillas marcadas
    const hiddenField = fieldContainer.querySelector('input[type="hidden"]');
    const checkboxes = fieldContainer.querySelectorAll(
      'input[type="checkbox"]:checked',
    );

    if (hiddenField) {
      // Crea un array con los valores de las casillas marcadas
      const selectedValues = Array.from(checkboxes).map((cb) => cb.value);

      // Actualiza el valor del campo oculto
      hiddenField.value = selectedValues.join(", ");

      // dispana manualmente el evento
      hiddenField.dispatchEvent(new Event("change", { bubbles: true }));
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
      return element.checked ? element.value : "";
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
    const formId = this.element.action.split("/").pop().split("?")[0];

    if (Object.keys(changedData).length === 0) {
      return;
    }

    // Offline-First: siempre guardar en IndexedDB y dejar que el proceso
    // de sincronización suba cambios (si online, se encola automáticamente)
    console.log("💾 Saving changes to IndexedDB (offline-first)...", changedData);
    await this.saveOffline(formId, changedData);
  }

  async saveOffline(formFillId, changedData) {
    if (!this.offlineStorage) {
      console.error("Offline storage is not available.");
      return;
    }

    try {
      await this.offlineStorage.saveFormFillData(formFillId, changedData);
      this.changedFields.clear();
      this.dispatchNotification("info", "Changes saved locally.");
    } catch (error) {
      console.error("Error saving to IndexedDB:", error);
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
      if (!navigator.onLine) {
        console.log(
          `🚫 Offline: Saving changes to IndexedDB...`,
          Object.fromEntries(this.changedFields),
        );
        // Guardar estructura y datos en IndexedDB
        try {
          const newStructure = JSON.parse(
            formStructureHiddenInput?.value || "[]",
          );
          await this.offlineStorage.saveFormFillStructure(
            this.idValue,
            newStructure,
          );
        } catch (e) {
          console.warn("No se pudo parsear la estructura para guardar offline:", e);
        }

        await this.offlineStorage.saveFormFillData(
          this.idValue,
          Object.fromEntries(this.changedFields),
        );
        this.dispatchNotification(
          "info",
          "You are offline. Changes saved locally.",
        );
        return;
      }

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
    // Debounce to avoid double handling between touchstart and click
    if (this._pdfSubmitting) return;
    this._pdfSubmitting = true;
    setTimeout(() => { this._pdfSubmitting = false; }, 800);

    // Ensure mobile browsers don't treat this as a ghost click or let any ancestor intercept
    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget || event.target;

    // Optional: reduce chance of double-tap triggering by blurring the active element
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    if (target?.dataset?.confirm) {
      const ok = window.confirm(target.dataset.confirm);
      if (!ok) return;
    }

    // Serialize current form structure and values safely
    const serialized = this.serializeForm();

    // Create a temporary form to POST to the server (works reliably across mobile browsers)
    const tempForm = document.createElement("form");
    tempForm.method = "POST";
    // Preserve the existing nested resource endpoint
    tempForm.action = this.element.action.replace(/(\/form_fills\/\d+).*/, "$1/submit_form");

    // CSRF token (Rails authenticity token)
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || this.csrfToken;

    const csrfInput = document.createElement("input");
    csrfInput.type = "hidden";
    csrfInput.name = "authenticity_token";
    csrfInput.value = csrfToken || "";

    const payloadInput = document.createElement("input");
    payloadInput.type = "hidden";
    // Match the server-expected param structure
    payloadInput.name = "form_fill[form_structure]";
    payloadInput.value = JSON.stringify(serialized);

    tempForm.appendChild(csrfInput);
    tempForm.appendChild(payloadInput);

    // Append, submit, and remove to avoid lingering nodes
    document.body.appendChild(tempForm);
    tempForm.submit();
    document.body.removeChild(tempForm);
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
          <span class="text-green-400">Saved</span>
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
          <span class="text-green-400">Saved</span>
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

  extractItemNumberFromSection(sectionName) {
    if (!sectionName || !sectionName.includes("|")) {
      return null;
    }

    const parts = sectionName.split("|");
    if (parts.length < 2) {
      return null;
    }

    // Buscar en todas las partes después del primer elemento
    for (let i = 1; i < parts.length; i++) {
      // Expresión regular para encontrar un número decimal al inicio del texto.
      const match = parts[i].trim().match(/^(\d+\.\d+)/);

      if (match) {
        // Devuelve el primer número encontrado
        return match[1];
      }
    }

    // Si no se encuentra ningún número decimal, retornar null
    return null;
  }

  dispatchNotification(type, message) {
    const event = new CustomEvent("show-notification", {
      bubbles: true,
      detail: { type, message },
    });
    window.dispatchEvent(event);
  }
}
