import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["banner"];

  connect() {
    this.deferredPrompt = null;
    this.hasUserEngaged = false;
    this.setupInstallPrompt();
    this.setupUserEngagement();
    // Mostrar banner inmediatamente
    this.showBanner();
  }

  setupUserEngagement() {
    // Detectar cualquier interacción del usuario
    const interactions = ["click", "scroll", "keydown", "touchstart"];

    const handleInteraction = () => {
      if (!this.hasUserEngaged) {
        this.hasUserEngaged = true;
        console.log("User engagement detectado");
        // Intentar disparar el prompt después de mínima interacción
        setTimeout(() => this.tryTriggerInstall(), 1000);
      }
      // Remover listeners después de primera interacción
      interactions.forEach((event) => {
        document.removeEventListener(event, handleInteraction);
      });
    };

    interactions.forEach((event) => {
      document.addEventListener(event, handleInteraction, { passive: true });
    });
  }

  setupInstallPrompt() {
    // Capturar el evento si el navegador lo dispara
    window.addEventListener("beforeinstallprompt", (e) => {
      console.log("PWA Install prompt capturado");
      e.preventDefault();
      this.deferredPrompt = e;

      // Si ya hay engagement, mostrar immediatamente
      if (this.hasUserEngaged) {
        setTimeout(() => this.tryNativeInstall(), 500);
      }
    });

    // Para iOS: detectar Safari
    this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    this.isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  }

  tryTriggerInstall() {
    // Intentar diferentes métodos para activar el prompt
    if (this.deferredPrompt) {
      this.tryNativeInstall();
    } else {
      // Simular eventos que puedan disparar beforeinstallprompt
      this.simulateEngagement();
    }
  }

  simulateEngagement() {
    // Crear actividad artificial para alcanzar el threshold
    const events = [
      new Event("scroll"),
      new Event("resize"),
      new Event("focus"),
    ];

    events.forEach((event, index) => {
      setTimeout(() => {
        window.dispatchEvent(event);
      }, index * 100);
    });

    // Verificar después de un momento
    setTimeout(() => {
      if (!this.deferredPrompt) {
        console.log("Prompt nativo no disponible, usando fallback");
      }
    }, 2000);
  }

  async tryNativeInstall() {
    if (this.deferredPrompt) {
      try {
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        console.log("Resultado instalación nativa:", outcome);

        if (outcome === "accepted") {
          this.hideBanner();
        }
        this.deferredPrompt = null;
        return true;
      } catch (error) {
        console.error("Error instalación nativa:", error);
      }
    }
    return false;
  }

  showBanner() {
    if (this.hasBannerTarget) {
      this.bannerTarget.style.display = "block";
      setTimeout(() => {
        this.bannerTarget.classList.add("show");
      }, 500);
    }
  }

  hideBanner() {
    if (this.hasBannerTarget) {
      this.bannerTarget.classList.remove("show");
      setTimeout(() => {
        this.bannerTarget.style.display = "none";
      }, 300);
    }
  }

  async install() {
    if (this.isIOS && this.isSafari) {
      // Instrucciones específicas para iOS Safari
      this.showIOSInstructions();
      return;
    }

    // Intentar instalación nativa primero
    const nativeSuccess = await this.tryNativeInstall();

    if (!nativeSuccess) {
      // Fallback a instrucciones manuales
      this.showManualInstructions();
    }
  }

  showIOSInstructions() {
    const modal = document.createElement("div");
    modal.innerHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      ">
        <div style="
          background: white;
          border-radius: 12px;
          padding: 24px;
          max-width: 400px;
          text-align: center;
        ">
          <h3 style="margin: 0 0 16px 0; color: #333;">Instalar App</h3>
          <p style="margin: 0 0 16px 0; color: #666;">
            Para instalar esta app en tu iPad/iPhone:
          </p>
          <ol style="text-align: left; color: #666; margin: 0 0 20px 0;">
            <li>Toca el botón de "Compartir" <span style="font-size: 18px;">⬆️</span></li>
            <li>Desplázate y selecciona "Añadir a pantalla de inicio"</li>
            <li>Toca "Añadir" en la esquina superior derecha</li>
          </ol>
          <button onclick="this.parentElement.parentElement.remove()" style="
            background: #007AFF;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
          ">Entendido</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  showManualInstructions() {
    const isChrome = /Chrome/.test(navigator.userAgent);
    const isEdge = /Edg/.test(navigator.userAgent);

    let instructions = "";
    if (isChrome) {
      instructions =
        'Ve al menú (⋮) en la esquina superior derecha → "Instalar Aes Pro"';
    } else if (isEdge) {
      instructions = 'Ve al menú (⋯) → "Apps" → "Instalar esta aplicación"';
    } else {
      instructions =
        'Busca en el menú del navegador la opción "Instalar" o "Añadir a pantalla de inicio"';
    }

    const modal = document.createElement("div");
    modal.innerHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      ">
        <div style="
          background: white;
          border-radius: 12px;
          padding: 24px;
          max-width: 400px;
          text-align: center;
        ">
          <h3 style="margin: 0 0 16px 0; color: #333;">Instalar App</h3>
          <p style="margin: 0 0 20px 0; color: #666;">
            ${instructions}
          </p>
          <div style="
            background: #f5f5f5;
            padding: 12px;
            border-radius: 8px;
            margin: 16px 0;
            font-size: 12px;
            color: #666;
          ">
            💡 Tip: También puedes arrastrar esta pestaña fuera del navegador para crear una ventana de app independiente
          </div>
          <button onclick="this.parentElement.parentElement.remove()" style="
            background: #007AFF;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
          ">Entendido</button>
        </div>
      </div
    `;
    document.body.appendChild(modal);
  }
}
