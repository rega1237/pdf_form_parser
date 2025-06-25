import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static values = { formId: String };

  triggerSaveDraft(event) {
    event.preventDefault();
    const formElement = document.getElementById(this.formIdValue);

    if (formElement) {
      const formController = this.application.getControllerForElementAndIdentifier(formElement, "form-fill");
      if (formController) {
        formController.saveDraft();
      } else {
        console.error(`FormFill controller not found on form with ID: ${this.formIdValue}`);
      }
    } else {
      console.error(`Form element with ID not found: ${this.formIdValue}`);
    }
  }
}