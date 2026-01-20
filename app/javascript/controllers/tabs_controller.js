import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["tab", "panel"];
  static classes = ["active", "inactive"];

  connect() {
    console.log("Tabs controller connected");
    this.showTab(0);
  }

  switch(event) {
    event.preventDefault();
    console.log("Switching tab");
    const index = this.tabTargets.indexOf(event.currentTarget);
    this.showTab(index);
  }

  showTab(index) {
    if (index < 0 || index >= this.tabTargets.length) return;

    this.tabTargets.forEach((tab, i) => {
      const isActive = i === index;

      // Manejo seguro de clases
      if (this.hasActiveClass) {
        if (isActive) {
          tab.classList.add(...this.activeClasses);
        } else {
          tab.classList.remove(...this.activeClasses);
        }
      }

      if (this.hasInactiveClass) {
        if (!isActive) {
          tab.classList.add(...this.inactiveClasses);
        } else {
          tab.classList.remove(...this.inactiveClasses);
        }
      }

      tab.setAttribute("aria-selected", isActive.toString());
    });

    this.panelTargets.forEach((panel, i) => {
      if (i === index) {
        panel.classList.remove("hidden");
      } else {
        panel.classList.add("hidden");
      }
    });
  }
}
