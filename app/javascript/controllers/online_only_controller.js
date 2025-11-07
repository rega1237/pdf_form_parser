import { Controller } from "@hotwired/stimulus"

// Controller: online-only
// Usage: add data-controller="online-only" to any button/link you want disabled when offline.
// Optional values:
//   data-online-only-offline-title-value: tooltip text when offline
//   data-online-only-online-title-value: tooltip text when online (clears by default)
export default class extends Controller {
  static values = {
    offlineTitle: String,
    onlineTitle: String
  }

  connect() {
    // Bind handlers to remove later
    this._onlineHandler = () => this.setState(true)
    this._offlineHandler = () => this.setState(false)

    // Initial state
    this.setState(navigator.onLine)

    // Listen to native and app-wide events
    window.addEventListener('online', this._onlineHandler)
    window.addEventListener('offline', this._offlineHandler)
    document.addEventListener('app:online', this._onlineHandler)
    document.addEventListener('app:offline', this._offlineHandler)
  }

  disconnect() {
    window.removeEventListener('online', this._onlineHandler)
    window.removeEventListener('offline', this._offlineHandler)
    document.removeEventListener('app:online', this._onlineHandler)
    document.removeEventListener('app:offline', this._offlineHandler)
  }

  setState(isOnline) {
    const el = this.element
    const disabled = !isOnline

    // Toggle disabled and aria attributes
    if ('disabled' in el) {
      el.disabled = disabled
    }
    el.setAttribute('aria-disabled', String(disabled))

    // Visual feedback
    el.classList.toggle('opacity-50', disabled)
    el.classList.toggle('cursor-not-allowed', disabled)

    // Avoid hover/touch effects while disabled
    try {
      el.style.pointerEvents = disabled ? 'none' : 'auto'
    } catch (e) {}

    // Titles/tooltips
    if (disabled) {
      const offlineTitle = this.offlineTitleValue || 'Offline: Connect to the internet to use this action'
      el.setAttribute('title', offlineTitle)
    } else {
      const onlineTitle = this.hasOnlineTitleValue ? this.onlineTitleValue : ''
      if (onlineTitle) {
        el.setAttribute('title', onlineTitle)
      } else {
        el.removeAttribute('title')
      }
    }
  }
}