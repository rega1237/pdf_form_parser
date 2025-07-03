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
          if (selectElement) { selectElement.value = field.value || ""; }
          const commentElement = formElements[`form_fill[${field.name}_comment]`];
          if (commentElement) { commentElement.value = field.comment_value || ""; }
          const itemElement = formElements[`form_fill[${field.name}_item]`];
          if (itemElement) { itemElement.value = field.Item || ""; }
          const riserElement = formElements[`form_fill[${field.name}_riser]`];
          if (riserElement) { riserElement.value = field.Riser || ""; }
          const cElement = formElements[`${field.name}_c`];
          if (cElement) { cElement.checked = field.C === "Yes" || field.C === true; }
          const dElement = formElements[`${field.name}_d`];
          if (dElement) { dElement.checked = field.D === "Yes" || field.D === true; }
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
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrfToken },
        body: JSON.stringify({ field_name: fieldName, attachment_id: attachmentId })
      });
      const data = await response.json();
      return data.photo_url;
    } catch (error) {
      console.error('Error fetching photo URL:', error);
      return null;
    }
  }
  
  get csrfToken() {
    return document.querySelector('meta[name="csrf-token"]').content;
  }
  
  serializeForm() {
    const formData = new FormData(this.element);
    const formFields = JSON.parse(this.element.dataset.formFillFormFieldsValue || "[]");
    
    return JSON.stringify(formFields.map(field => {
        if (field.type === "Photo") return field;
        
        if (field.type === "Deficiency") {
          return {
            ...field,
            value: formData.get(`form_fill[${field.name}_select]`) || '',
            comment_value: formData.get(`form_fill[${field.name}_comment]`) || '',
            Item: formData.get(`form_fill[${field.name}_item]`) || '',
            Riser: formData.get(`form_fill[${field.name}_riser]`) || '',
            C: formData.has(`${field.name}_c`) ? "Yes" : "",
            D: formData.has(`${field.name}_d`) ? "Yes" : ""
          };
        }
        
        return { ...field, value: formData.get(`form_fill[${field.name}]`) || field.value || "" };
    }));
  }

  async saveDraft(event) {
    if (event) event.preventDefault();
    
    const formStructureHiddenInput = document.getElementById("form_fill_form_structure");
    if (formStructureHiddenInput) {
      formStructureHiddenInput.value = this.serializeForm();
    }
    
    const formData = new FormData(this.element);

    fetch(this.element.action, {
      method: "PATCH",
      headers: { "X-CSRF-Token": this.csrfToken, Accept: "application/json" },
      body: formData,
    })
      .then(response => response.json().then(data => ({ ok: response.ok, data })))
      .then(({ ok, data }) => {
        if (ok) {
          this.dispatchNotification("success", data.message || "Draft saved successfully.");
          this.reloadFormStructure();
        } else {
          this.dispatchNotification("error", data.message || "Could not save draft.");
        }
      })
      .catch(() => this.dispatchNotification("error", "Network error when saving draft."));
  }

  async submitToPdf(event) {
    event.stopPropagation();
    
    const confirmMessage = event.currentTarget.dataset.confirm;
    if (!confirm(confirmMessage)) return;

    const formStructureHiddenInput = document.getElementById("form_fill_form_structure");
    if (formStructureHiddenInput) {
      formStructureHiddenInput.value = this.serializeForm();
    }

    const dynamicForm = document.createElement('form');
    dynamicForm.method = 'post';
    dynamicForm.action = this.element.action.replace(/(\/form_fills\/\d+).*/, "$1/submit_form");
    
    const csrfInput = document.createElement('input');
    csrfInput.type = 'hidden';
    csrfInput.name = 'authenticity_token';
    csrfInput.value = this.csrfToken;
    dynamicForm.appendChild(csrfInput);

    const structureInput = document.createElement('input');
    structureInput.type = 'hidden';
    structureInput.name = 'form_fill[form_structure]';
    structureInput.value = formStructureHiddenInput.value;
    dynamicForm.appendChild(structureInput);

    document.body.appendChild(dynamicForm);
    dynamicForm.submit();
    document.body.removeChild(dynamicForm);
  }

  async reloadFormStructure() {
    try {
      const formId = this.element.action.split('/').pop().split('?')[0];
      const response = await fetch(`/form_fills/${formId}/structure`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrfToken }
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
    const event = new CustomEvent("show-notification", {
      bubbles: true,
      detail: { type, message }
    });
    window.dispatchEvent(event);
  }
}