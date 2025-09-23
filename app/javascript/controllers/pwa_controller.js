import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static values = {
    environment: String,
  };

  connect() {
    this.isDevelopment = this.environmentValue === "development";
    this.updateInProgress = false;

    this.registerServiceWorker();
  }

  async registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      console.log("Service Worker no soportado");
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });

      console.log("Service Worker registrado:", registration.scope);

      // Manejar actualizaciones del SW
      registration.addEventListener("updatefound", () => {
        this.handleUpdateFound(registration.installing);
      });

      // Detectar cuando un nuevo SW toma control
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        this.handleControllerChange();
      });
    } catch (error) {
      console.error("Error registrando Service Worker:", error);
    }
  }

  handleUpdateFound(newWorker) {
    newWorker.addEventListener("statechange", () => {
      if (
        newWorker.state === "installed" &&
        navigator.serviceWorker.controller &&
        !this.updateInProgress
      ) {
        this.updateInProgress = true;

        if (this.isDevelopment) {
          console.log(
            "Nueva versión del Service Worker disponible (desarrollo)",
          );
          console.log(
            "En desarrollo: actualizaciones silenciadas para evitar molestias",
          );
        } else {
          this.showUpdatePrompt(newWorker);
        }
      }
    });
  }

  showUpdatePrompt(newWorker) {
    if (confirm("Nueva versión disponible. ¿Actualizar ahora?")) {
      newWorker.postMessage({ type: "SKIP_WAITING" });
      window.location.reload();
    } else {
      this.updateInProgress = false;
    }
  }

  handleControllerChange() {
    if (this.updateInProgress && !this.isDevelopment) {
      window.location.reload();
    }
  }
}
