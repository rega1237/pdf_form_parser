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
            ? field.options && field.options.length > 0
              ? field.options[0]
              : true
            : false;
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
      .then((response) => {
        if (response.ok) {
          console.log("Draft saved successfully");
          // Optionally, update UI or provide feedback
          // If 'Next Page' was clicked, the pagination controller will handle the page change.
          // We might want to reload form values if the server could have modified them.
          // this.loadFormValues(); // Re-load values if necessary after save
        } else {
          response
            .json()
            .then((data) => {
              console.error("Failed to save draft:", data);
              // Display errors to the user
            })
            .catch(() => {
              console.error("Failed to save draft and parse error response.");
            });
        }
      })
      .catch((error) => {
        console.error("Error saving draft:", error);
      });
  }
}
