import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["template", "container"]

  add(e) {
    if (e) e.preventDefault()
    
    // Replace the 'NEW_RECORD' string with a real unique ID
    const content = this.templateTarget.innerHTML.replace(/NEW_RECORD/g, new Date().getTime())
    this.containerTarget.insertAdjacentHTML('beforeend', content)
  }

  remove(e) {
    e.preventDefault()
    
    const wrapper = e.target.closest('.nested-email-wrapper')
    
    // If it's a persisted record, mark _destroy as true
    const destroyInput = wrapper.querySelector('input[name*="[_destroy]"]')
    if (destroyInput) {
      destroyInput.value = '1'
      wrapper.style.display = 'none'
    } else {
      // Otherwise just remove it from DOM
      wrapper.remove()
    }
  }
}
