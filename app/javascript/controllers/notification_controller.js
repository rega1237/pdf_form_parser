import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  /**
   * Inicializa el controlador.
   */
  connect() {}

  /**
   * Crea y muestra una notificación tipo toast.
   * Este método puede ser llamado desde otros controladores o event listeners.
   * @param {CustomEvent} event - El evento que contiene los detalles de la notificación (tipo, mensaje).
   */
  showNotification(event) {
    const { type, message } = event.detail;
    const notification = document.createElement("div");
    notification.className = `fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg transition-all duration-300 transform translate-x-full`;
    notification.setAttribute("data-controller", "notification");

    if (type === "success") {
      notification.className += ` bg-green-500 text-white`;
    } else if (type === "error") {
      notification.className += ` bg-red-500 text-white`;
    } else {
      notification.className += ` bg-blue-500 text-white`;
    }

    notification.innerHTML = `
      <div class="flex items-center space-x-2">
        <span>${message}</span>
        <button class="ml-2 text-white hover:text-gray-200" data-action="click->notification#closeNotification">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
    `;

    // Eliminar cualquier notificación existente antes de añadir una nueva
    const existingNotification = document.querySelector(
      ".fixed.top-4.right-4.z-50",
    );
    if (existingNotification) {
      existingNotification.remove();
    }
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.remove("translate-x-full");
    }, 10);

    setTimeout(() => {
      if (notification.parentElement) {
        notification.classList.add("translate-x-full");
        setTimeout(() => {
          if (notification.parentElement) {
            notification.remove();
          }
        }, 300);
      }
    }, 3000);
  }

  /**
   * Closes the notification toast with an animation.
   */
  closeNotification() {
    const notification = this.element;
    notification.classList.add("translate-x-full");
    setTimeout(() => {
      notification.remove();
    }, 300);
  }
}
