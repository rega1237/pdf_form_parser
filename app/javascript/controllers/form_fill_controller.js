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

        if (field.type === "Deficiency") {
          const selectElement = formElements[`form_fill[${field.name}_select]`];
          if (selectElement) {
            selectElement.value = field.value || "";
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

  displayExistingPhoto(fileInput, fieldData) {
    const fieldId = fileInput.id;
    const previewContainer = document.getElementById(`photo-preview-${fieldId}`);
    
    if (previewContainer && fieldData.photo_attachment_id) {
      const imageElement = previewContainer.querySelector('[data-photo-capture-target="image"]');
      if (imageElement && imageElement.src && imageElement.src !== window.location.href) {
        previewContainer.classList.remove('hidden');
      } else {
        this.fetchPhotoUrl(fieldData.name, fieldData.photo_attachment_id)
          .then(photoUrl => {
            if (photoUrl && imageElement) {
              imageElement.src = photoUrl;
              previewContainer.classList.remove('hidden');
            }
          });
      }
    }
  }

  async fetchPhotoUrl(fieldName, attachmentId) {
    try {
      const formId = this.element.action.split('/').pop().split('?')[0];
      const response = await fetch(`/form_fills/${formId}/photo_url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.querySelector('[name="csrf-token"]').content,
        },
        body: JSON.stringify({ field_name: fieldName, attachment_id: attachmentId })
      });
      const data = await response.json();
      return data.photo_url;
    } catch (error) {
      console.error('Error fetching photo URL:', error);
      return null;
    }
  }

  serializeForm() {
    const formData = new FormData(this.element);
    const formFields = JSON.parse(this.element.dataset.formFillFormFieldsValue || "[]");
    let updatedStructure = [];

    if (Array.isArray(formFields)) {
      updatedStructure = formFields.map((field) => {
        const newRawValue = formData.get(`form_fill[${field.name}]`);
        let newValue = newRawValue;

        if (field.type === "Photo") {
          return { ...field };
        } else if (field.type === "Deficiency") {
          const selectValue = formData.get(`form_fill[${field.name}_select]`);
          const commentValue = formData.get(`form_fill[${field.name}_comment]`);
          const itemValue = formData.get(`form_fill[${field.name}_item]`);
          const riserValue = formData.get(`form_fill[${field.name}_riser]`);
          const cValue = formData.has(`${field.name}_c`) ? "Yes" : "";
          const dValue = formData.has(`${field.name}_d`) ? "Yes" : "";
          
          return { ...field, value: selectValue || field.value || "", comment_value: commentValue || field.comment_value || "", Item: itemValue || field.Item || "", Riser: riserValue || field.Riser || "", C: cValue || field.C || "", D: dValue || field.D || "" };
        } else if (newRawValue === null) {
          newValue = field.value || "";
        }
        
        return { ...field, value: newValue };
      });
    }
    return JSON.stringify(updatedStructure);
  }

  saveDraft(event) {
    if (event) event.preventDefault();
    
    const formStructureHiddenInput = document.getElementById("form_fill_form_structure");
    if (!formStructureHiddenInput) {
      console.error("Hidden form_structure input not found");
      return;
    }
    formStructureHiddenInput.value = this.serializeForm();

    const formData = new FormData(this.element);

    fetch(this.element.action, {
      method: "PATCH",
      headers: {
        "X-CSRF-Token": document.querySelector('[name="csrf-token"]').content,
        Accept: "application/json",
      },
      body: formData,
    })
      .then((response) => response.json().then(data => ({ status: response.status, ok: response.ok, data: data })))
      .then(({ ok, data }) => {
        if (ok) {
          this.dispatchNotification("success", data.message || "Draft saved successfully.");
          this.reloadFormStructure();
        } else {
          this.dispatchNotification("error", data.message || "Could not save draft.");
        }
      })
      .catch(() => {
        this.dispatchNotification("error", "Network error when saving draft.");
      });
  }

  /**
   * Cambia la acción y el MÉTODO del formulario para enviarlo a la ruta de generación de PDF.
   */
  submitToPdf(event) {
    event.stopPropagation();
    
    const form = this.element;
    const confirmMessage = event.currentTarget.dataset.confirm;

    if (confirm(confirmMessage)) {
      const formFillId = form.action.match(/\/form_fills\/(\d+)/)[1];
      const pdfUrl = `/form_fills/${formFillId}/submit_form`;

      // SOLUCIÓN: Buscar el campo oculto `_method` y cambiar su valor a `post`.
      const methodInput = form.querySelector('input[name="_method"]');
      if (methodInput) {
        methodInput.value = 'post';
      }

      form.action = pdfUrl;
      form.requestSubmit();
    }
  }

  async reloadFormStructure() {
    try {
      const formId = this.element.action.split('/').pop().split('?')[0];
      const response = await fetch(`/form_fills/${formId}/structure`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector('[name="csrf-token"]').content }
      });
      
      if (response.ok) {
        const data = await response.json();
        this.element.dataset.formFillFormStructureValue = data.form_structure;
        this.element.dataset.formFillFormFieldsValue = JSON.stringify(data.form_fields);
        this.loadFormValues();
      }
    } catch (error) {
      console.error('Error reloading form structure:', error);
    }
  }

  dispatchNotification(type, message) {
    this.dispatch("showNotification", {
      detail: { type, message },
      prefix: "",
    });
  }
}