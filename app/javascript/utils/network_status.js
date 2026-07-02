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

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      const isOnline = navigator.onLine
      if (lastIsOnline === false && isOnline === true) {
        dispatch('app:online')
      } else if (lastIsOnline === true && isOnline === false) {
        dispatch('app:offline')
      }
      lastIsOnline = isOnline
    }
  }

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  // No initial dispatch; rely on transitions
})()