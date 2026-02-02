import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = [
    "fileInput",
    "fileInfo",
    "fileName",
    "fileSize",
    "uploadArea",
  ];

  // Initializes the controller and sets up event listeners
  connect() {
    this.setupEventListeners();
  }

  // Helper to handle disconnection logic if needed
  disconnect() {}

  // Sets up specific event listeners for the file input
  setupEventListeners() {
    // Prevent file input click from propagating to other elements
    this.fileInputTarget.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  // Handles the file input change event
  fileChanged(event) {
    const file = event.target.files[0];
    this.updateFileInfo(file);
  }

  // Triggers the hidden file input when the upload area is clicked
  triggerFileInput(event) {
    // Prevent event propagation
    event.preventDefault();
    event.stopPropagation();
    this.fileInputTarget.click();
  }

  // Clears the selected file and resets the UI
  clearFile(event) {
    event.preventDefault();
    event.stopPropagation();
    this.fileInputTarget.value = "";
    this.fileInfoTarget.classList.add("hidden");
  }

  // Handles drag over event to show drop visual feedback
  dragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    this.uploadAreaTarget.classList.add("drag-over");
  }

  // Handles drag leave event to remove drop visual feedback
  dragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    this.uploadAreaTarget.classList.remove("drag-over");
  }

  // Handles file drop event
  drop(event) {
    event.preventDefault();
    event.stopPropagation();
    this.uploadAreaTarget.classList.remove("drag-over");

    const files = event.dataTransfer.files;
    if (files.length > 0) {
      // Create a new FileList for the input
      const dt = new DataTransfer();
      dt.items.add(files[0]);
      this.fileInputTarget.files = dt.files;

      // Update file information display
      this.updateFileInfo(files[0]);
    }
  }

  // Updates the UI with selected file details
  updateFileInfo(file) {
    if (file) {
      this.fileNameTarget.textContent = file.name;
      this.fileSizeTarget.textContent = this.formatFileSize(file.size);
      this.fileInfoTarget.classList.remove("hidden");
    }
  }

  // Formats file size in bytes to human-readable string
  formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }
}
