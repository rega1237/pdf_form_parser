import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["formStructure"];

  connect() {
    // Sincronizar la estructura de fotos al conectar para asegurar consistencia
    this.syncPhotoStructure();

    // Agregar event listener para recargar valores del formulario
    this.element.addEventListener(
      "reload-form-values",
      this.handleReloadFormValues.bind(this),
    );
  }

  // Método para sincronizar la estructura del formulario con fotos existentes
  async syncPhotoStructure() {
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

        const hiddenInput = document.getElementById("form_fill_form_structure");
        if (hiddenInput) {
          hiddenInput.value = data.form_structure;
        }

        this.loadFormValues();
      }
    } catch (error) {
      console.error("Error syncing photo structure:", error);
    }
  }

  disconnect() {
    // Limpiar event listener al desconectar
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
    const formStructureData = JSON.parse(
      this.element.dataset.formFillFormStructureValue || "[]",
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
          const commentElement =
            formElements[`form_fill[${field.name}_comment]`];
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

  get csrfToken() {
    return document.querySelector('meta[name="csrf-token"]').content;
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

    const formStructureHiddenInput = document.getElementById(
      "form_fill_form_structure",
    );
    if (formStructureHiddenInput) {
      formStructureHiddenInput.value = this.serializeForm();
    }

    // Crear FormData (las fotos ya se subieron inmediatamente)
    const formData = new FormData(this.element);

    fetch(this.element.action, {
      method: "PATCH",
      headers: { "X-CSRF-Token": this.csrfToken, Accept: "application/json" },
      body: formData,
    })
      .then((response) =>
        response.json().then((data) => ({ ok: response.ok, data })),
      )
      .then(({ ok, data }) => {
        if (ok) {
          this.dispatchNotification(
            "success",
            data.message || "Draft saved successfully.",
          );
          this.reloadFormStructure();
        } else {
          this.dispatchNotification(
            "error",
            data.message || "Could not save draft.",
          );
        }
      })
      .catch(() =>
        this.dispatchNotification("error", "Network error when saving draft."),
      );
  }

  async submitToPdf(event) {
    event.stopPropagation();

    const confirmMessage = event.currentTarget.dataset.confirm;
    if (!confirm(confirmMessage)) return;

    const formStructureHiddenInput = document.getElementById(
      "form_fill_form_structure",
    );
    if (formStructureHiddenInput) {
      formStructureHiddenInput.value = this.serializeForm();
    }

    const dynamicForm = document.createElement("form");
    dynamicForm.method = "post";
    dynamicForm.action = this.element.action.replace(
      /(\/form_fills\/\d+).*/,
      "$1/submit_form",
    );

    const csrfInput = document.createElement("input");
    csrfInput.type = "hidden";
    csrfInput.name = "authenticity_token";
    csrfInput.value = this.csrfToken;
    dynamicForm.appendChild(csrfInput);

    const structureInput = document.createElement("input");
    structureInput.type = "hidden";
    structureInput.name = "form_fill[form_structure]";
    structureInput.value = formStructureHiddenInput.value;
    dynamicForm.appendChild(structureInput);

    document.body.appendChild(dynamicForm);
    dynamicForm.submit();
    document.body.removeChild(dynamicForm);
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
          <span class="text-green-400">Guardada</span>
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
          <span class="text-green-400">Guardada</span>
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

  dispatchNotification(type, message) {
    const event = new CustomEvent("show-notification", {
      bubbles: true,
      detail: { type, message },
    });
    window.dispatchEvent(event);
  }
}
