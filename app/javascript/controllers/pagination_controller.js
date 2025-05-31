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
  }

  nextPage() {
    if (this.currentPage < this.totalPages - 1) {
      this.currentPage++;
      this.showCurrentPage();
      this.updateButtonStates();
    }
  }

  backPage() {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.showCurrentPage();
      this.updateButtonStates();
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
}
