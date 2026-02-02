import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = [
    "formContent",
    "systemSelection",
    "intervalSelection",
    "systemCategoryInput",
    "intervalCategoryInput", // Usado para el modo de selección única
    "systemCategoryDisplay",
    "intervalCategoryDisplay",
    "systemCategoryButtons",
    "intervalCategoryButtons",
    "intervalCheckboxesContainer", // Usado para el modo de selección múltiple
  ];

  static values = {
    systemCategories: Array,
    intervalCategories: Array,
    selectionMode: { type: String, default: "single" },
  };

  /**
   * Inicializa el controlador, construye botones de categoría, actualiza valores de visualización,
   * y configura el manejador de la tecla escape.
   */
  connect() {
    this.buildCategoryButtons();
    this.updateDisplayValues();
    this.escapeHandler = this.handleEscape.bind(this);
    document.addEventListener("keydown", this.escapeHandler);
  }

  /**
   * Limpia los event listeners cuando el controlador se desconecta.
   */
  disconnect() {
    document.removeEventListener("keydown", this.escapeHandler);
  }

  /**
   * Construye dinámicamente los botones de categoría de sistema e intervalo basados en valores.
   */
  buildCategoryButtons() {
    this.systemCategoryButtonsTarget.innerHTML = "";
    this.intervalCategoryButtonsTarget.innerHTML = "";

    this.systemCategoriesValue.forEach((category) => {
      const button = this.createSystemCategoryButton(category);
      this.systemCategoryButtonsTarget.appendChild(button);
    });

    this.intervalCategoriesValue.forEach((category) => {
      const button = this.createIntervalCategoryButton(category);
      this.intervalCategoryButtonsTarget.appendChild(button);
    });

    if (this.isMultipleMode) {
      this.addDoneButtonToIntervals();
    }
  }

  /**
   * Crea un elemento botón para una categoría de sistema.
   * @param {Object} category - El objeto de categoría de sistema.
   * @returns {HTMLButtonElement} El elemento botón creado.
   */
  createSystemCategoryButton(category) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = "click->inspection-modal#selectSystemCategory";
    button.dataset.value = category.name;
    button.className =
      "system-category-btn group flex flex-col items-center justify-center text-center p-4 md:p-6 bg-slate-800/90 border border-white/10 rounded-2xl shadow-lg hover:bg-indigo-600 hover:shadow-indigo-500/50 transition-all duration-300 transform hover:-translate-y-1";

    if (category.thumbnail_url) {
      const img = document.createElement("img");
      img.src = category.thumbnail_url;
      img.alt = category.name;
      img.className = "w-12 h-12 md:w-16 md:h-16 mb-3 object-contain";
      button.appendChild(img);
    } else {
      const fallback = document.createElement("div");
      fallback.className =
        "w-12 h-12 md:w-16 md:h-16 mb-3 flex items-center justify-center bg-slate-700 rounded-full text-indigo-300 text-2xl font-bold";
      fallback.textContent = category.name.charAt(0);
      button.appendChild(fallback);
    }

    const span = document.createElement("span");
    span.className = "font-semibold text-white text-sm md:text-base";
    span.textContent = category.name;
    button.appendChild(span);

    return button;
  }

  /**
   * Crea un elemento botón para una categoría de intervalo.
   * @param {Object} category - El objeto de categoría de intervalo.
   * @returns {HTMLButtonElement} El elemento botón creado.
   */
  createIntervalCategoryButton(category) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = "click->inspection-modal#handleIntervalSelection";
    button.dataset.value = category.id;
    button.dataset.name = category.name;
    button.className =
      "interval-category-btn w-full text-left p-6 bg-slate-800/90 border border-white/10 rounded-xl shadow-lg hover:bg-blue-600/50 transition-all duration-200 flex items-center justify-between";

    const nameSpan = document.createElement("span");
    nameSpan.className = "block text-white font-bold text-lg";
    nameSpan.textContent = category.name;
    button.appendChild(nameSpan);

    const checkIconContainer = document.createElement("div");
    checkIconContainer.className =
      "w-6 h-6 rounded-full border-2 border-slate-500 flex-shrink-0 flex items-center justify-center transition-all duration-200";
    checkIconContainer.innerHTML = `<svg class="w-4 h-4 text-white opacity-0 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
    button.appendChild(checkIconContainer);

    if (this.isMultipleMode && this.hasIntervalCheckboxesContainerTarget) {
      const checkbox = this.intervalCheckboxesContainerTarget.querySelector(
        `input[value="${category.id}"]`,
      );
      if (checkbox && checkbox.checked) {
        this.toggleIntervalButtonStyle(button, true);
      }
    }

    return button;
  }

  /**
   * Agrega un botón 'Done' a la vista de selección de intervalos para el modo de selección múltiple.
   */
  addDoneButtonToIntervals() {
    const doneButton = document.createElement("button");
    doneButton.type = "button";
    doneButton.textContent = "Done";
    doneButton.className =
      "w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl transition-colors";
    doneButton.dataset.action = "click->inspection-modal#confirmMultiSelect";
    this.intervalSelectionTarget.appendChild(doneButton);
  }

  /**
   * Verifica si el modo de selección está configurado como 'multiple'.
   * @returns {boolean} Verdadero si el modo de selección múltiple está habilitado.
   */
  get isMultipleMode() {
    return this.selectionModeValue === "multiple";
  }

  /**
   * Maneja la selección de una categoría de sistema.
   * @param {Event} event - El evento de clic.
   */
  selectSystemCategory(event) {
    const value = event.currentTarget.dataset.value;
    this.systemCategoryInputTarget.value = value;
    this.updateDisplayValues();
    this.hideAllViews();
    setTimeout(() => this.showIntervalSelection(), 150);
  }

  /**
   * Maneja la selección de una categoría de intervalo, enrutando a lógica única o múltiple.
   * @param {Event} event - El evento de clic.
   */
  handleIntervalSelection(event) {
    if (this.isMultipleMode) {
      this.toggleIntervalSelection(event.currentTarget);
    } else {
      this.selectSingleInterval(event.currentTarget);
    }
  }

  /**
   * Selecciona una categoría de intervalo única y regresa al formulario.
   * @param {HTMLElement} button - El elemento botón que fue clickeado.
   */
  selectSingleInterval(button) {
    const name = button.dataset.name;
    this.intervalCategoryInputTarget.value = name;
    this.updateDisplayValues();
    this.backToForm();
  }

  /**
   * Alterna el estado de selección de una categoría de intervalo en modo múltiple.
   * @param {HTMLElement} button - El elemento botón que fue clickeado.
   */
  toggleIntervalSelection(button) {
    const isSelected = button.classList.contains("selected");
    this.toggleIntervalButtonStyle(button, !isSelected);

    if (this.hasIntervalCheckboxesContainerTarget) {
      const checkbox = this.intervalCheckboxesContainerTarget.querySelector(
        `input[value="${button.dataset.value}"]`,
      );
      if (checkbox) {
        checkbox.checked = !isSelected;
      }
    }
  }

  /**
   * Actualiza el estilo visual de un botón de categoría de intervalo basado en el estado de selección.
   * @param {HTMLElement} button - El elemento botón.
   * @param {boolean} forceSelected - Si forzar el estado seleccionado.
   */
  toggleIntervalButtonStyle(button, forceSelected) {
    const checkIconContainer = button.querySelector(".border-2");
    const checkIcon = checkIconContainer.querySelector("svg");

    button.classList.toggle("selected", forceSelected);
    checkIconContainer.classList.toggle("bg-blue-600", forceSelected);
    checkIconContainer.classList.toggle("border-blue-500", forceSelected);
    checkIconContainer.classList.toggle("border-slate-500", !forceSelected);
    checkIcon.classList.toggle("opacity-100", forceSelected);
    checkIcon.classList.toggle("opacity-0", !forceSelected);
  }

  /**
   * Confirma la selección en modo múltiple y regresa al formulario.
   */
  confirmMultiSelect() {
    this.updateDisplayValues();
    this.backToForm();
  }

  /**
   * Actualiza el texto de visualización para categorías de sistema e intervalo basado en las entradas actuales.
   */
  updateDisplayValues() {
    // Actualizar System Category Display
    const systemValue = this.systemCategoryInputTarget.value;
    if (systemValue) {
      this.systemCategoryDisplayTarget.textContent = systemValue;
      this.systemCategoryDisplayTarget.classList.remove("text-slate-400");
      this.systemCategoryDisplayTarget.classList.add("text-white");
    } else {
      this.systemCategoryDisplayTarget.textContent = "Select System Category";
      this.systemCategoryDisplayTarget.classList.remove("text-white");
      this.systemCategoryDisplayTarget.classList.add("text-slate-400");
    }

    // Actualizar Interval Category Display
    if (this.isMultipleMode) {
      const selectedNames = Array.from(
        this.intervalCategoryButtonsTarget.querySelectorAll(".selected"),
      ).map((btn) => btn.dataset.name);

      if (selectedNames.length > 0) {
        this.intervalCategoryDisplayTarget.textContent =
          selectedNames.join(", ");
        this.intervalCategoryDisplayTarget.classList.remove("text-slate-400");
        this.intervalCategoryDisplayTarget.classList.add("text-white");
      } else {
        this.intervalCategoryDisplayTarget.textContent =
          "Select Interval Categories";
        this.intervalCategoryDisplayTarget.classList.remove("text-white");
        this.intervalCategoryDisplayTarget.classList.add("text-slate-400");
      }
    } else if (this.hasIntervalCategoryInputTarget) {
      const intervalValue = this.intervalCategoryInputTarget.value;
      if (intervalValue) {
        this.intervalCategoryDisplayTarget.textContent = intervalValue;
        this.intervalCategoryDisplayTarget.classList.remove("text-slate-400");
        this.intervalCategoryDisplayTarget.classList.add("text-white");
      } else {
        this.intervalCategoryDisplayTarget.textContent =
          "Select Interval Category";
        this.intervalCategoryDisplayTarget.classList.remove("text-white");
        this.intervalCategoryDisplayTarget.classList.add("text-slate-400");
      }
    }
  }

  /**
   * Abre la vista modal de selección de sistema.
   */
  openSystemModal() {
    this.hideAllViews();
    this.showSystemSelection();
  }

  /**
   * Abre la vista modal de selección de intervalo.
   */
  openIntervalModal() {
    this.hideAllViews();
    this.showIntervalSelection();
  }

  /**
   * Regresa a la vista de contenido principal del formulario.
   */
  backToForm() {
    this.hideAllViews();
    setTimeout(() => this.showFormContent(), 150);
  }

  /**
   * Regresa a la vista de selección de sistema.
   */
  backToSystemSelection() {
    this.hideAllViews();
    setTimeout(() => this.showSystemSelection(), 150);
  }

  /**
   * Oculta todas las vistas modales (formulario, selección de sistema, selección de intervalo).
   */
  hideAllViews() {
    this.formContentTarget.classList.add("hidden");
    this.systemSelectionTarget.classList.add("hidden");
    this.intervalSelectionTarget.classList.add("hidden");
    this.formContentTarget.style.opacity = "0";
    this.systemSelectionTarget.style.opacity = "0";
    this.intervalSelectionTarget.style.opacity = "0";
  }

  /**
   * Muestra la vista de contenido del formulario con animación.
   */
  showFormContent() {
    this.formContentTarget.classList.remove("hidden");
    this.animateIn(this.formContentTarget);
  }

  /**
   * Muestra la vista de selección de sistema con animación.
   */
  showSystemSelection() {
    this.systemSelectionTarget.classList.remove("hidden");
    this.animateIn(this.systemSelectionTarget);
  }

  /**
   * Muestra la vista de selección de intervalo con animación.
   */
  showIntervalSelection() {
    this.intervalSelectionTarget.classList.remove("hidden");
    this.animateIn(this.intervalSelectionTarget);
  }

  /**
   * Anima un elemento hacia la vista.
   * @param {HTMLElement} element - El elemento a animar.
   */
  animateIn(element) {
    element.style.opacity = "0";
    element.style.transform = "translateY(20px)";
    requestAnimationFrame(() => {
      element.style.transition = "all 0.3s ease-out";
      element.style.opacity = "1";
      element.style.transform = "translateY(0)";
    });
  }

  /**
   * Maneja la pulsación de la tecla Escape para cerrar el modal o volver al formulario.
   * @param {KeyboardEvent} event - El evento de teclado.
   */
  handleEscape(event) {
    if (event.key === "Escape") {
      if (this.formContentTarget.classList.contains("hidden")) {
        this.backToForm();
      }
    }
  }
}
