import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["template"];
  static values = {
    recipientEmail: String,
    formFillId: Number,
    csrfToken: String,
  };

  // Initializes the controller
  connect() {}

  // Opens the email modal by cloning the template and appending it to the body
  openModal() {
    const content = this.templateTarget.content.cloneNode(true);
    document.body.appendChild(content);

    // Get reference to the modal element (it's the last child of body now)
    // Note: This relies on the template having a single root element which is the modal wrapper
    this.activeModal = document.body.lastElementChild;
    document.body.classList.add("overflow-hidden");

    // Add event listeners manually since we are outside of Stimulus scope
    this.setupEventListeners();
  }

  // Sets up event listeners for the modal elements (close and send buttons)
  setupEventListeners() {
    if (!this.activeModal) return;

    // Close buttons
    const closeButtons = this.activeModal.querySelectorAll(
      '[data-action="close"]',
    );
    closeButtons.forEach((btn) => {
      btn.addEventListener("click", () => this.closeModal());
    });

    // Send button
    const sendButton = this.activeModal.querySelector('[data-action="send"]');
    if (sendButton) {
      sendButton.addEventListener("click", (e) => this.sendEmail(e));
    }
  }

  // Closes the modal and cleans up the DOM
  closeModal() {
    if (this.activeModal) {
      this.activeModal.remove();
      this.activeModal = null;
      document.body.classList.remove("overflow-hidden");
    }
  }

  // Handles the email sending process including validation and API request
  async sendEmail(event) {
    event.preventDefault();

    if (this.isLoading) return;

    // Get values from active modal
    const subjectInput = this.activeModal.querySelector(
      "input[name='subject']",
    );
    const subject = subjectInput ? subjectInput.value : "";

    // For Trix, we need to find the hidden input or the editor value
    // rich_text_area_tag creates a hidden input with name="email_body"
    // But since it's dynamically inserted, let's verify if Trix synced
    const bodyInput = this.activeModal.querySelector(
      "input[name='email_body']",
    );
    const body = bodyInput ? bodyInput.value : "";

    if (!subject) {
      this.handleError("Please enter a subject");
      return;
    }

    // Show loading state
    this.showLoadingState();

    try {
      // Send AJAX request
      const response = await this.sendEmailRequest(subject, body);

      if (response.ok) {
        const data = await response.json();
        this.closeModal();
        this.handleSuccess(data.message || "Email sent successfully!");
      } else {
        const errorData = await response.json();
        this.handleError(
          errorData.message || "Failed to send email. Please try again.",
        );
        this.hideLoadingState(); // Only hide loading if error, otherwise modal closes
      }
    } catch (error) {
      console.error("Email sending error:", error);
      this.handleError(
        "Network error occurred. Please check your connection and try again.",
      );
      this.hideLoadingState();
    }
  }

  // Sends the email request to the server
  async sendEmailRequest(subject, body) {
    const formData = new FormData();
    formData.append("authenticity_token", this.csrfTokenValue);
    formData.append("subject", subject);
    formData.append("body", body);

    return fetch(`/form_fills/${this.formFillIdValue}/send_email`, {
      method: "POST",
      body: formData,
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json",
      },
    });
  }

  // Updates the UI to show the loading state
  showLoadingState() {
    this.isLoading = true;
    const submitButton = this.activeModal.querySelector('[data-action="send"]');
    if (submitButton) {
      submitButton.disabled = true;
      const originalText = submitButton.innerHTML;
      submitButton.dataset.originalText = originalText;
      submitButton.innerHTML = `
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Sending...
      `;
    }
  }

  // Restores the UI from the loading state
  hideLoadingState() {
    this.isLoading = false;
    const submitButton = this.activeModal?.querySelector(
      '[data-action="send"]',
    );
    if (submitButton) {
      submitButton.disabled = false;
      if (submitButton.dataset.originalText) {
        submitButton.innerHTML = submitButton.dataset.originalText;
      }
    }
  }

  // Displays a success notification
  handleSuccess(message) {
    // Dispatch custom event for notification system
    window.dispatchEvent(
      new CustomEvent("show-notification", {
        detail: {
          type: "success",
          message: message,
        },
      }),
    );
  }

  // Displays an error notification
  handleError(message) {
    // Dispatch custom event for notification system
    window.dispatchEvent(
      new CustomEvent("show-notification", {
        detail: {
          type: "error",
          message: message,
        },
      }),
    );
  }
}
