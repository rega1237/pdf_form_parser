// app/javascript/controllers/inspection_modal_controller.js
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = [
    "modal",
    "modalContent",
    "modalTitle", 
    "systemGrid", 
    "intervalGrid", 
    "backButton",
    "systemCategoryInput",
    "intervalCategoryInput",
    "systemCategoryDisplay",
    "intervalCategoryDisplay"
  ]

  connect() {
    // Bind escape key handler
    this.escapeHandler = this.handleEscape.bind(this)
    
    // Initialize display values if form has existing values
    this.updateDisplayValues()
  }

  disconnect() {
    // Clean up event listeners
    document.removeEventListener("keydown", this.escapeHandler)
    this.restoreBodyScroll()
  }

  updateDisplayValues() {
    // Update system category display
    const systemValue = this.systemCategoryInputTarget.value
    if (systemValue) {
      this.systemCategoryDisplayTarget.textContent = systemValue
      this.systemCategoryDisplayTarget.classList.remove("text-slate-400")
      this.systemCategoryDisplayTarget.classList.add("text-white")
    }

    // Update interval category display
    const intervalValue = this.intervalCategoryInputTarget.value
    if (intervalValue) {
      this.intervalCategoryDisplayTarget.textContent = intervalValue
      this.intervalCategoryDisplayTarget.classList.remove("text-slate-400")
      this.intervalCategoryDisplayTarget.classList.add("text-white")
    }
  }

  openSystemModal() {
    this.showModal()
    this.showSystemGrid()
    this.modalTitleTarget.textContent = "Select System Category"
  }

  openIntervalModal() {
    this.showModal()
    this.showSystemGrid()
    this.modalTitleTarget.textContent = "Select System Category"
  }

  selectSystemCategory(event) {
    const value = event.currentTarget.dataset.value
    
    // Update the hidden input
    this.systemCategoryInputTarget.value = value
    
    // Update the display
    this.systemCategoryDisplayTarget.textContent = value
    this.systemCategoryDisplayTarget.classList.remove("text-slate-400")
    this.systemCategoryDisplayTarget.classList.add("text-white")
    
    // Show interval selection
    this.showIntervalGrid()
    this.modalTitleTarget.textContent = "Select Interval Category"
  }

  selectIntervalCategory(event) {
    const value = event.currentTarget.dataset.value
    
    // Update the hidden input
    this.intervalCategoryInputTarget.value = value
    
    // Update the display
    this.intervalCategoryDisplayTarget.textContent = value
    this.intervalCategoryDisplayTarget.classList.remove("text-slate-400")
    this.intervalCategoryDisplayTarget.classList.add("text-white")
    
    // Close modal
    this.closeModal()
  }

  backToSystemGrid() {
    this.showSystemGrid()
    this.modalTitleTarget.textContent = "Select System Category"
  }

  showModal() {
    // Block body scroll
    this.blockBodyScroll()
    
    // Show modal
    this.modalTarget.classList.remove("hidden")
    
    // Add escape key listener
    document.addEventListener("keydown", this.escapeHandler)
    
    // Add entrance animation
    requestAnimationFrame(() => {
      this.modalContentTarget.style.transform = "scale(1)"
      this.modalContentTarget.style.opacity = "1"
    })
  }

  closeModal() {
    // Remove escape key listener
    document.removeEventListener("keydown", this.escapeHandler)
    
    // Add exit animation
    this.modalContentTarget.style.transform = "scale(0.95)"
    this.modalContentTarget.style.opacity = "0"
    
    // Hide modal after animation
    setTimeout(() => {
      this.modalTarget.classList.add("hidden")
      this.restoreBodyScroll()
      this.resetModal()
    }, 200)
  }

  resetModal() {
    // Hide interval grid and back button
    this.intervalGridTarget.classList.add("hidden")
    this.intervalGridTarget.classList.remove("grid")
    this.backButtonTarget.classList.add("hidden")
    
    // Show system grid
    this.systemGridTarget.classList.remove("hidden")
    this.systemGridTarget.classList.add("grid")
    
    // Reset modal content animation
    this.modalContentTarget.style.transform = "scale(0.95)"
    this.modalContentTarget.style.opacity = "0"
  }

  showSystemGrid() {
    // Hide interval components
    this.intervalGridTarget.classList.add("hidden")
    this.intervalGridTarget.classList.remove("grid")
    this.backButtonTarget.classList.add("hidden")
    
    // Show system grid
    this.systemGridTarget.classList.remove("hidden")
    this.systemGridTarget.classList.add("grid")
  }

  showIntervalGrid() {
    // Hide system grid
    this.systemGridTarget.classList.add("hidden")
    this.systemGridTarget.classList.remove("grid")
    
    // Show interval components
    this.intervalGridTarget.classList.remove("hidden")
    this.intervalGridTarget.classList.add("grid")
    this.backButtonTarget.classList.remove("hidden")
  }

  blockBodyScroll() {
    // Save current scroll position
    this.scrollPosition = window.pageYOffset || document.documentElement.scrollTop || 0
    
    // Add CSS class to block scroll
    document.body.style.position = 'fixed'
    document.body.style.top = `-${this.scrollPosition}px`
    document.body.style.width = '100%'
    document.body.style.overflow = 'hidden'
  }

  restoreBodyScroll() {
    // Remove CSS that blocks scroll
    document.body.style.position = ''
    document.body.style.top = ''
    document.body.style.width = ''
    document.body.style.overflow = ''
    
    // Restore scroll position
    if (this.scrollPosition !== undefined) {
      window.scrollTo(0, this.scrollPosition)
    }
  }

  handleEscape(event) {
    if (event.key === "Escape") {
      this.closeModal()
    }
  }
}