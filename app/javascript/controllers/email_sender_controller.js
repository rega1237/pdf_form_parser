import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["buttonText", "spinner"];
  static values = {
    recipientEmail: String,
    formFillId: Number,
    csrfToken: String,
  };

  connect() {
    console.log("Email sender controller connected");
    this.originalButtonText = this.hasButtonTextTarget
      ? this.buttonTextTarget.textContent
      : "Send Email";
  }

  async sendEmail(event) {
    event.preventDefault();

    // Prevent double submission
    if (this.element.disabled || this.isLoading) {
      return false;
    }

    // Show confirmation dialog
    const confirmed = await this.showConfirmationDialog();
    if (!confirmed) {
      return false;
    }

    // Show loading state
    this.showLoadingState();

    try {
      // Send AJAX request
      const response = await this.sendEmailRequest();

      if (response.ok) {
        const data = await response.json();
        this.handleSuccess(data.message || "Email sent successfully!");
      } else {
        const errorData = await response.json();
        this.handleError(
          errorData.message || "Failed to send email. Please try again.",
        );
      }
    } catch (error) {
      console.error("Email sending error:", error);
      this.handleError(
        "Network error occurred. Please check your connection and try again.",
      );
    } finally {
      this.hideLoadingState();
    }
  }

  async showConfirmationDialog() {
    return new Promise((resolve) => {
      // Create custom confirmation modal
      const modal = this.createConfirmationModal();
      document.body.appendChild(modal);

      // Handle confirm button
      const confirmBtn = modal.querySelector('[data-action="confirm"]');
      const cancelBtn = modal.querySelector('[data-action="cancel"]');

      const cleanup = () => {
        modal.remove();
      };

      confirmBtn.addEventListener("click", () => {
        cleanup();
        resolve(true);
      });

      cancelBtn.addEventListener("click", () => {
        cleanup();
        resolve(false);
      });

      // Handle escape key
      const handleEscape = (e) => {
        if (e.key === "Escape") {
          cleanup();
          document.removeEventListener("keydown", handleEscape);
          resolve(false);
        }
      };
      document.addEventListener("keydown", handleEscape);

      // Show modal with animation
      setTimeout(() => {
        modal.classList.remove("opacity-0");
        modal.querySelector(".transform").classList.remove("scale-95");
        modal.querySelector(".transform").classList.add("scale-100");
      }, 10);
    });
  }

  createConfirmationModal() {
    const modal = document.createElement("div");
    modal.className =
      "fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 opacity-0 transition-opacity duration-300";

    modal.innerHTML = `
      <div class="bg-white rounded-lg shadow-xl transform scale-95 transition-transform duration-300 max-w-md w-full mx-4">
        <div class="p-6">
          <div class="flex items-center mb-4">
            <div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mr-4">
              <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
              </svg>
            </div>
            <h3 class="text-lg font-semibold text-gray-900">Confirm Email Sending</h3>
          </div>
          
          <p class="text-gray-600 mb-2">
            Are you sure you want to send the inspection PDF to:
          </p>
          <p class="font-semibold text-gray-900 mb-6">
            ${this.recipientEmailValue || "the customer"}
          </p>
          
          <div class="flex justify-end space-x-3">
            <button data-action="cancel" class="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors duration-200">
              Cancel
            </button>
            <button data-action="confirm" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200">
              Send Email
            </button>
          </div>
        </div>
      </div>
    `;

    return modal;
  }

  async sendEmailRequest() {
    const formData = new FormData();
    formData.append("authenticity_token", this.csrfTokenValue);

    return fetch(`/form_fills/${this.formFillIdValue}/send_email`, {
      method: "POST",
      body: formData,
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json",
      },
    });
  }

  showLoadingState() {
    this.isLoading = true;

    // Disable the button
    this.element.disabled = true;

    // Update button text and show spinner
    if (this.hasButtonTextTarget) {
      this.buttonTextTarget.textContent = "Sending...";
    }

    if (this.hasSpinnerTarget) {
      this.spinnerTarget.classList.remove("hidden");
    }

    // Add visual loading state classes
    this.element.classList.add("email-button-loading");
    this.element.classList.remove(
      "hover:scale-[1.02]",
      "hover:from-purple-600",
      "hover:to-purple-800",
    );
  }

  hideLoadingState() {
    this.isLoading = false;

    // Re-enable the button
    this.element.disabled = false;

    // Reset button text and hide spinner
    if (this.hasButtonTextTarget) {
      this.buttonTextTarget.textContent = this.originalButtonText;
    }

    if (this.hasSpinnerTarget) {
      this.spinnerTarget.classList.add("hidden");
    }

    // Remove visual loading state classes and restore hover effects
    this.element.classList.remove("email-button-loading");
    this.element.classList.add(
      "hover:scale-[1.02]",
      "hover:from-purple-600",
      "hover:to-purple-800",
    );
  }

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

  // Handle page reload/navigation to reset state if needed
  disconnect() {
    this.hideLoadingState();
  }
}
