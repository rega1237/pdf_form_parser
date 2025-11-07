// Global network status dispatcher
// Ensures app-wide online/offline events are emitted regardless of page controllers
(() => {
  let lastIsOnline = navigator.onLine

  const dispatch = (name) => {
    try {
      const event = new CustomEvent(name, { bubbles: true })
      document.dispatchEvent(event)
    } catch (e) {
      console.warn(`[network_status] Failed to dispatch ${name}:`, e)
    }
  }

  const handleOnline = () => {
    const isOnline = navigator.onLine
    if (lastIsOnline === false && isOnline === true) {
      dispatch('app:online')
    }
    lastIsOnline = isOnline
  }

  const handleOffline = () => {
    const isOnline = navigator.onLine
    if (lastIsOnline === true && isOnline === false) {
      dispatch('app:offline')
    }
    lastIsOnline = isOnline
  }

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  // No initial dispatch; rely on transitions
})()