import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["indicator", "text"]

  connect() {
    this.updateStatus()
    window.addEventListener("online", () => this.updateStatus())
    window.addEventListener("offline", () => this.updateStatus())
  }

  disconnect() {
    window.removeEventListener("online", () => this.updateStatus())
    window.removeEventListener("offline", () => this.updateStatus())
  }

  updateStatus() {
    const isOnline = navigator.onLine
    
    if (isOnline) {
      this.indicatorTarget.className = "w-2 h-2 rounded-full mr-2 bg-green-500"
      this.textTarget.textContent = "Online"
    } else {
      this.indicatorTarget.className = "w-2 h-2 rounded-full mr-2 bg-red-500"
      this.textTarget.textContent = "Offline"
    }
  }
}