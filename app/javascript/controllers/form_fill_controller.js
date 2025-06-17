import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["formStructure"];

  connect() {
    this.loadFormValues();
  }

  loadFormValues() {
    const formStructureData = JSON.parse(
      this.element.dataset.formFillFormStructureValue || "[]"
    );
    const formElements = this.element.elements;

    formStructureData.forEach((field) => {
      if (field.name) {
        // Rails form helpers often namespace fields, e.g., form_data[field_name]
        // Adjust selector if your form naming is different.
        const inputElement = formElements[`form_fill[${field.name}]`];
        if (inputElement) {
          if (
            inputElement.type === "checkbox" ||
            inputElement.type === "radio"
          ) {
            // For checkboxes/radios, check if the field's value matches the input's value
            // or if the field's value is boolean true.
            inputElement.checked =
              field.value === inputElement.value ||
              field.value === true ||
              field.value === "true";
          } else {
            inputElement.value = field.value;
          }
        }
      }
    });
  }

  serializeForm() {
    const formData = new FormData(this.element);
    const formFields = JSON.parse(
      this.element.dataset.formFillFormFieldsValue || "[]"
    );
    let updatedStructure = [];

    if (Array.isArray(formFields)) {
      updatedStructure = formFields.map((field) => {
        const newRawValue = formData.get(`form_fill[${field.name}]`);
        let newValue = newRawValue;

        if (field.type === "Button") {
          // Assuming 'Button' type is a checkbox
          // FormData returns 'on' if checked and present, or null if not.
          // Map this to the actual value or boolean true/false.
          newValue = formData.has(`form_fill[${field.name}]`)
            ? (field.options && field.options.length > 1 ? field.options[1] : true) // If checked, use the second option ('Yes') or true
            : (field.options && field.options.length > 0 ? field.options[0] : false); // If unchecked, use the first option ('Off') or false
        } else if (newRawValue === null) {
          // If the field wasn't in FormData (e.g. unchecked checkbox not submitted or empty text field),
          // retain its original value unless it's a checkbox that should be false.
          newValue = field.value; // Keep original value if no new value and not a checkbox that should be false
        }
        return { ...field, value: newValue };
      });
    }
    return JSON.stringify(updatedStructure);
  }

  saveDraft(event) {
    if (event) event.preventDefault();
    const formStructureHiddenInput = document.getElementById(
      "form_fill_form_structure"
    );
    if (!formStructureHiddenInput) {
      console.error("Hidden form_structure input not found");
      return;
    }
    formStructureHiddenInput.value = this.serializeForm();

    const formData = new FormData(this.element);
    // The form_structure is now correctly set in the hidden field by serializeForm,
    // so it will be included when new FormData(this.element) is created for the fetch body.

    fetch(this.element.action, {
      method: "PATCH",
      headers: {
        "X-CSRF-Token": document.querySelector('[name="csrf-token"]').content,
        // 'Content-Type': 'application/json', // Not needed when sending FormData
        Accept: "application/json",
      },
      body: formData, // Send as FormData
    })
      .then((response) => response.json().then(data => ({ status: response.status, ok: response.ok, data: data })))
      .then(({ status, ok, data }) => {
        if (ok) {
          this.displayFlashMessage(
            "success",
            data.message || "Draft saved successfully."
          );
        } else {
          this.displayFlashMessage(
            "error",
            data.message || "Could not save draft."
          );
          console.error("Fallo al guardar borrador:", data);
        }
      })
      .catch((error) => {
        this.displayFlashMessage("error", "Network error when saving draft.");
        console.error("Error saving draft:", error);
      });
  }

  displayFlashMessage(type, message) {
    const flashContainer = document.querySelector('.flash-messages');
    if (!flashContainer) {
      console.error("Flash message container not found.");
      return;
    }

    const alertDiv = document.createElement('div');
    let flashClass = '';
    switch (type) {
      case 'success':
        flashClass = 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300';
        break;
      case 'error':
        flashClass = 'bg-red-500/10 border-red-500/20 text-red-300';
        break;
      case 'alert':
        flashClass = 'bg-amber-500/10 border-amber-500/20 text-amber-300';
        break;
      case 'notice':
        flashClass = 'bg-blue-500/10 border-blue-500/20 text-blue-300';
        break;
      default:
        flashClass = 'bg-gray-500/10 border-gray-500/20 text-gray-300';
    }

    alertDiv.className = `${flashClass} px-4 py-3 rounded-lg relative mb-4 border backdrop-blur-sm shadow-lg animate-fade-in`;
    alertDiv.setAttribute('role', 'alert');
    alertDiv.innerHTML = `
      <div class="flex items-center">
        <div class="py-1"><svg class="fill-current h-6 w-6 mr-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M2.93 17.07A10 10 0 1 1 17.07 2.93 10 10 0 0 1 2.93 17.07zm12.73-1.41A8 8 0 1 0 4.34 4.34a8 8 0 0 0 11.32 11.32zM9 11V9h2v6H9v-4zm0-6h2v2H9V5z"/></svg></div>
        <div>
          <p class="font-bold">${message}</p>
        </div>
      </div>
    `;

    flashContainer.prepend(alertDiv);

    // Automatically remove the message after 5 seconds
    setTimeout(() => {
      alertDiv.remove();
    }, 5000);
  }
}
