import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["generatingState", "timeoutState"];

  static values = {
    id: String,
    status: String,
    refreshInterval: { type: Number, default: 5000 }, // 5 seconds default
  };

  connect() {
    this.pollAttempts = 0;
    if (this.statusValue === "generating") {
      this.startPolling();
    }
  }

  disconnect() {
    this.stopPolling();
  }

  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      this.checkStatus();
    }, this.refreshIntervalValue);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async checkStatus() {
    if (!this.idValue) return;

    this.pollAttempts += 1;

    if (this.pollAttempts >= 20) { // Limit to 20 attempts (~100 seconds)
      console.warn("PDF generation is taking longer than expected. Showing retry UI.");
      this.stopPolling();
      this.showTimeoutUI();
      return;
    }

    try {
      const response = await fetch(`/form_fills/${this.idValue}/pdf_status`, {
        headers: {
          "Accept": "application/json",
          "X-Requested-With": "XMLHttpRequest"
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        if (data.status === "completed" || data.status === "failed" || data.completed) {
          this.stopPolling();
          window.location.reload();
        }
      }
    } catch (error) {
      console.error("Error checking PDF status:", error);
    }
  }

  showTimeoutUI() {
    if (this.hasGeneratingStateTarget) {
      this.generatingStateTarget.classList.add("hidden");
    }
    if (this.hasTimeoutStateTarget) {
      this.timeoutStateTarget.classList.remove("hidden");
    }
  }

  statusValueChanged() {
    if (this.statusValue === "generating") {
      this.pollAttempts = 0;
      this.startPolling();
    } else {
      this.stopPolling();
    }
  }
}
