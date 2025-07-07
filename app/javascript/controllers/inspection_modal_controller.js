import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = [
    "formContent",
    "systemSelection",
    "intervalSelection",
    "systemCategoryInput",
    "intervalCategoryInput",
    "systemCategoryDisplay",
    "intervalCategoryDisplay",
    "systemCategoryButtons",
    "intervalCategoryButtons",
  ];

  static values = {
    systemCategories: Array,
    intervalCategories: Array,
  };

  connect() {
    this.buildCategoryButtons();
    this.updateDisplayValues();
    this.escapeHandler = this.handleEscape.bind(this);
    document.addEventListener("keydown", this.escapeHandler);
  }

  disconnect() {
    document.removeEventListener("keydown", this.escapeHandler);
  }

  buildCategoryButtons() {
    // Construir botones de System Category
    this.systemCategoriesValue.forEach((category) => {
      const button = this.createSystemCategoryButton(category);
      this.systemCategoryButtonsTarget.appendChild(button);
    });

    // Construir botones de Interval Category
    this.intervalCategoriesValue.forEach((category) => {
      const button = this.createIntervalCategoryButton(category);
      this.intervalCategoryButtonsTarget.appendChild(button);
    });
  }

  // Método para crear un botón de System Category
  createSystemCategoryButton(category) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = "click->inspection-modal#selectSystemCategory";
    button.dataset.value = category.name;
    button.className =
      "system-category-btn group flex flex-col items-center justify-center text-center p-4 md:p-6 bg-red-600 border border-white/10 rounded-2xl shadow-lg hover:bg-red-700 hover:shadow-red-600/50 transition-all duration-300 transform hover:-translate-y-1";

    // Suponiendo que `category` tiene un `thumbnail_url`.
    // Si no lo tienes, puedes remover la imagen o poner un ícono por defecto.
    // Para que esto funcione, debes exponer `thumbnail_url` en el JSON desde el controlador de Rails.
    if (category.thumbnail_url) {
        const img = document.createElement("img");
        img.src = category.thumbnail_url;
        img.alt = category.name;
        img.className = "w-12 h-12 md:w-16 md:h-16 mb-3 object-contain";
        button.appendChild(img);
    } else {
        // Fallback a un ícono o iniciales si no hay thumbnail
        const fallback = document.createElement("div");
        fallback.className = "w-12 h-12 md:w-16 md:h-16 mb-3 flex items-center justify-center bg-slate-700 rounded-full text-indigo-300 text-2xl font-bold";
        fallback.textContent = category.name.charAt(0);
        button.appendChild(fallback);
    }


    const span = document.createElement("span");
    span.className = "font-semibold text-white text-sm md:text-base";
    span.textContent = category.name;
    button.appendChild(span);

    return button;
  }

  // Método para crear un botón de Interval Category
  createIntervalCategoryButton(category) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = "click->inspection-modal#selectIntervalCategory";
    button.dataset.value = category.name;
    button.className =
      "interval-category-btn w-full text-left p-6 bg-slate-800/90 border border-white/10 rounded-xl shadow-lg hover:bg-blue-600 hover:shadow-blue-500/50 transition-all duration-200";

    const span = document.createElement("span");
    span.className = "block text-white font-bold text-lg";
    span.textContent = category.name;
    button.appendChild(span);

    return button;
  }

  updateDisplayValues() {
    const systemValue = this.systemCategoryInputTarget.value;
    if (systemValue) {
      this.systemCategoryDisplayTarget.textContent = systemValue;
      this.systemCategoryDisplayTarget.classList.remove("text-slate-400");
      this.systemCategoryDisplayTarget.classList.add("text-white");
    }

    const intervalValue = this.intervalCategoryInputTarget.value;
    if (intervalValue) {
      this.intervalCategoryDisplayTarget.textContent = intervalValue;
      this.intervalCategoryDisplayTarget.classList.remove("text-slate-400");
      this.intervalCategoryDisplayTarget.classList.add("text-white");
    }
  }

  openSystemModal() {
    this.hideAllViews();
    this.showSystemSelection();
  }

  openIntervalModal() {
    this.hideAllViews();
    this.showIntervalSelection();
  }

  selectSystemCategory(event) {
    const value = event.currentTarget.dataset.value;
    this.systemCategoryInputTarget.value = value;
    this.systemCategoryDisplayTarget.textContent = value;
    this.systemCategoryDisplayTarget.classList.remove("text-slate-400");
    this.systemCategoryDisplayTarget.classList.add("text-white");
    this.hideAllViews();
    setTimeout(() => this.showIntervalSelection(), 150);
  }

  selectIntervalCategory(event) {
    const value = event.currentTarget.dataset.value;
    this.intervalCategoryInputTarget.value = value;
    this.intervalCategoryDisplayTarget.textContent = value;
    this.intervalCategoryDisplayTarget.classList.remove("text-slate-400");
    this.intervalCategoryDisplayTarget.classList.add("text-white");
    this.hideAllViews();
    setTimeout(() => this.showFormContent(), 150);
  }

  backToForm() {
    this.hideAllViews();
    setTimeout(() => this.showFormContent(), 150);
  }

  backToSystemSelection() {
    this.hideAllViews();
    setTimeout(() => this.showSystemSelection(), 150);
  }

  hideAllViews() {
    this.formContentTarget.classList.add("hidden");
    this.systemSelectionTarget.classList.add("hidden");
    this.intervalSelectionTarget.classList.add("hidden");
    this.formContentTarget.style.opacity = "0";
    this.systemSelectionTarget.style.opacity = "0";
    this.intervalSelectionTarget.style.opacity = "0";
  }

  showFormContent() {
    this.formContentTarget.classList.remove("hidden");
    this.animateIn(this.formContentTarget);
  }

  showSystemSelection() {
    this.systemSelectionTarget.classList.remove("hidden");
    this.animateIn(this.systemSelectionTarget);
  }

  showIntervalSelection() {
    this.intervalSelectionTarget.classList.remove("hidden");
    this.animateIn(this.intervalSelectionTarget);
  }

  animateIn(element) {
    element.style.opacity = "0";
    element.style.transform = "translateY(20px)";
    requestAnimationFrame(() => {
      element.style.transition = "all 0.3s ease-out";
      element.style.opacity = "1";
      element.style.transform = "translateY(0)";
    });
  }

  handleEscape(event) {
    if (event.key === "Escape") {
      if (!this.formContentTarget.classList.contains("hidden")) return;
      this.backToForm();
    }
  }
}