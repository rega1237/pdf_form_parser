import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = [
    "pageContent",
    "backPageBtn",
    "nextPageBtn",
    "submitFormBtn",
  ];

  connect() {
    this.currentPage = 0;
    this.totalPages = this.pageContentTargets.length;
    this.updateButtonStates();
    this.showCurrentPage();
    this.updateProgress();
  }

  nextPage() {
    if (this.currentPage < this.totalPages - 1) {
      this.currentPage++;
      this.showCurrentPage();
      this.updateButtonStates();
      this.updateProgress();
    }
  }

  backPage() {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.showCurrentPage();
      this.updateButtonStates();
      this.updateProgress();
    }
  }

  showCurrentPage() {
    this.pageContentTargets.forEach((page, index) => {
      page.classList.toggle("hidden", index !== this.currentPage);
    });
  }

  updateButtonStates() {
    this.backPageBtnTarget.disabled = this.currentPage === 0;
    this.nextPageBtnTarget.disabled = this.currentPage === this.totalPages - 1;

    if (this.currentPage === this.totalPages - 1) {
      this.nextPageBtnTarget.classList.add("hidden");
      this.submitFormBtnTarget.classList.remove("hidden");
    } else {
      this.nextPageBtnTarget.classList.remove("hidden");
      this.submitFormBtnTarget.classList.add("hidden");
    }

    // Ensure submit button is hidden if there are no pages or only one page from the start
    if (this.totalPages <= 1) {
      this.nextPageBtnTarget.classList.add("hidden");
      this.submitFormBtnTarget.classList.remove("hidden");
      this.backPageBtnTarget.disabled = true; // Also disable back if only one page
    }
  }

  // Update progress bar
  updateProgress() {
    const progressBar = document.getElementById("progress-bar");
    const pageIndicator = document.getElementById("page-indicator");

    if (progressBar && pageIndicator) {
      const progressPercentage =
        ((this.currentPage + 1) / this.totalPages) * 100;
      progressBar.style.width = progressPercentage + "%";
      pageIndicator.textContent =
        "Página " + (this.currentPage + 1) + " de " + this.totalPages;
    }
  }
}
