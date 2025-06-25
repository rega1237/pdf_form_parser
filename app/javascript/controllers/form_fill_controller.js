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
          // Verificar si es un input de tipo file (Photo fields)
          if (inputElement.type === "file") {
            // NO intentar asignar valor a inputs de tipo file
            // Si hay photo_attachment_id, mostrar la foto existente
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
    });
  }

  // Método para mostrar foto existente
  displayExistingPhoto(fileInput, fieldData) {
    const fieldId = fileInput.id;
    const previewContainer = document.getElementById(`photo-preview-${fieldId}`);
    
    if (previewContainer && fieldData.photo_attachment_id) {
      const imageElement = previewContainer.querySelector('[data-photo-capture-target="image"]');
      
      // Si la imagen ya tiene src desde el servidor (renderizada en ERB), mantenerla
      if (imageElement && imageElement.src && imageElement.src !== window.location.href) {
        // La imagen ya está cargada desde el servidor
        previewContainer.classList.remove('hidden');
        console.log(`Existing photo displayed for field: ${fieldData.name}`);
        
        // Buscar el controlador photo-capture y notificarle que hay una foto cargada
        const photoCaptureElement = fileInput.closest('[data-controller*="photo-capture"]');
        if (photoCaptureElement) {
          // La imagen ya está visible, no necesitamos hacer nada más
          // El controlador photo-capture mantendrá el estado actual
        }
      } else {
        // Fallback: obtener URL del servidor si no está renderizada
        this.fetchPhotoUrl(fieldData.name, fieldData.photo_attachment_id)
          .then(photoUrl => {
            if (photoUrl && imageElement) {
              imageElement.src = photoUrl;
              previewContainer.classList.remove('hidden');
              console.log(`Photo URL loaded for field: ${fieldData.name}`);
            }
          })
          .catch(error => {
            console.error('Error loading existing photo:', error);
          });
      }
    }
  }

  // Método para obtener URL de foto del servidor
  async fetchPhotoUrl(fieldName, attachmentId) {
    try {
      const formId = this.element.action.split('/').pop().split('?')[0];
      const response = await fetch(`/form_fills/${formId}/photo_url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.querySelector('[name="csrf-token"]').content,
        },
        body: JSON.stringify({
          field_name: fieldName,
          attachment_id: attachmentId
        })
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
    const formFields = JSON.parse(
      this.element.dataset.formFillFormFieldsValue || "[]"
    );
    let updatedStructure = [];

    if (Array.isArray(formFields)) {
      updatedStructure = formFields.map((field) => {
        const newRawValue = formData.get(`form_fill[${field.name}]`);
        let newValue = newRawValue;

        if (field.type === "Button") {
          newValue = formData.has(`form_fill[${field.name}]`)
            ? (field.options && field.options.length > 1 ? field.options[1] : true)
            : (field.options && field.options.length > 0 ? field.options[0] : false);
        } else if (field.type === "Photo") {
          // Para campos Photo, mantener el valor actual y photo_attachment_id
          // El archivo se maneja separadamente por FormData
          const updatedField = { ...field };
          
          // Si hay un archivo nuevo, se procesará en el servidor
          // Si no hay archivo nuevo, mantener el attachment_id existente
          if (!newRawValue || newRawValue.size === 0) {
            // No hay archivo nuevo, mantener datos existentes
            updatedField.value = field.value || "";
          } else {
            // Hay archivo nuevo, se procesará en el servidor
            updatedField.value = ""; // El servidor actualizará esto
          }
          
          return updatedField;
        } else if (field.type === "Deficiency") {
          // Manejar campos Deficiency con select y comment
          const selectValue = formData.get(`form_fill[${field.name}_select]`);
          const commentValue = formData.get(`form_fill[${field.name}_comment]`);
          
          return {
            ...field,
            value: selectValue || field.value || "",
            comment_value: commentValue || field.comment_value || ""
          };
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
    
    const formStructureHiddenInput = document.getElementById(
      "form_fill_form_structure"
    );
    if (!formStructureHiddenInput) {
      console.error("Hidden form_structure input not found");
      return;
    }
    
    // Actualizar la estructura antes de enviar
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
      .then(({ status, ok, data }) => {
        if (ok) {
          this.dispatchNotification(
            "success",
            data.message || "Draft saved successfully."
          );
          
          // Recargar los valores del formulario para reflejar cambios del servidor
          // (como nuevos photo_attachment_ids)
          this.reloadFormStructure();
        } else {
          this.dispatchNotification(
            "error",
            data.message || "Could not save draft."
          );
          console.error("Error saving draft:", data);
        }
      })
      .catch((error) => {
        this.dispatchNotification("error", "Network error when saving draft.");
        console.error("Error saving draft:", error);
      });
  }

  // Método para recargar la estructura del formulario después de guardar
  async reloadFormStructure() {
    try {
      const formId = this.element.action.split('/').pop().split('?')[0];
      const response = await fetch(`/form_fills/${formId}/structure`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.querySelector('[name="csrf-token"]').content,
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        // Actualizar los datasets con la nueva estructura
        this.element.dataset.formFillFormStructureValue = data.form_structure;
        this.element.dataset.formFillFormFieldsValue = JSON.stringify(data.form_fields);
        
        // Recargar valores (especialmente útil para mostrar nuevas fotos)
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