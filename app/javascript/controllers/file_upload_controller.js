import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = [
    "fileInput",
    "fileInfo",
    "fileName",
    "fileSize",
    "uploadArea",
  ];

  connect() {
    console.log("FileUpload controller connected");
    this.setupEventListeners();
  }

  disconnect() {
    console.log("FileUpload controller disconnected");
  }

  setupEventListeners() {
    // Prevenir que el input de archivo interfiera con otros elementos
    this.fileInputTarget.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  // Acción para cuando cambia el input de archivo
  fileChanged(event) {
    const file = event.target.files[0];
    this.updateFileInfo(file);
  }

  // Acción para cuando se hace clic en el área de carga
  triggerFileInput(event) {
    // Prevenir propagación del evento
    event.preventDefault();
    event.stopPropagation();
    this.fileInputTarget.click();
  }

  // Acción para limpiar el archivo seleccionado
  clearFile(event) {
    event.preventDefault();
    event.stopPropagation();
    this.fileInputTarget.value = "";
    this.fileInfoTarget.classList.add("hidden");
  }

  // Drag and drop actions
  dragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    this.uploadAreaTarget.classList.add("drag-over");
  }

  dragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    this.uploadAreaTarget.classList.remove("drag-over");
  }

  drop(event) {
    event.preventDefault();
    event.stopPropagation();
    this.uploadAreaTarget.classList.remove("drag-over");

    const files = event.dataTransfer.files;
    if (files.length > 0) {
      // Crear un nuevo FileList para el input
      const dt = new DataTransfer();
      dt.items.add(files[0]);
      this.fileInputTarget.files = dt.files;

      // Actualizar la información del archivo
      this.updateFileInfo(files[0]);
    }
  }

  // Método privado para actualizar la información del archivo
  updateFileInfo(file) {
    if (file) {
      this.fileNameTarget.textContent = file.name;
      this.fileSizeTarget.textContent = this.formatFileSize(file.size);
      this.fileInfoTarget.classList.remove("hidden");
    }
  }

  // Método privado para formatear el tamaño del archivo
  formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }
}
