import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["select", "search"]

  // Initializes the controller and sets up the search input if missing
  connect() {
    // Auto-insert a search input if one is not present
    if (!this.hasSearchTarget) {
      const input = document.createElement("input")
      input.type = "text"
      input.placeholder = "Search sections..."
      input.className = "w-full bg-slate-700 text-white border-2 border-slate-500 rounded-lg py-2 px-3 mb-2 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      input.setAttribute("data-filterable-select-target", "search")
      input.setAttribute("data-action", "input->filterable-select#filter keydown.enter->filterable-select#selectFirst")
      this.element.insertBefore(input, this.selectTarget)
    }

    // Ensure the placeholder option (first) is always visible
    this._showAllOptions()
  }

  // Filters the select options based on the search query
  filter() {
    const query = (this.searchTarget.value || "").toLowerCase()
    const options = Array.from(this.selectTarget.options)

    options.forEach((opt, idx) => {
      if (idx === 0) {
        // Keep the first placeholder option visible
        opt.hidden = false
        return
      }
      const text = (opt.text || "").toLowerCase()
      const match = text.includes(query)
      opt.hidden = !match
    })
  }

  // Selects the first visible option when pressing enter
  selectFirst(event) {
    event.preventDefault()
    // Select the first visible option (excluding placeholder), then dispatch change
    const visible = Array.from(this.selectTarget.options).filter((opt, idx) => idx !== 0 && !opt.hidden)
    if (visible.length > 0) {
      this.selectTarget.value = visible[0].value
      this.selectTarget.dispatchEvent(new Event("change", { bubbles: true }))
    }
  }

  // Clears the search input and shows all options
  clear() {
    if (this.hasSearchTarget) {
      this.searchTarget.value = ""
      this._showAllOptions()
    }
  }

  // Helper to make all options visible
  _showAllOptions() {
    Array.from(this.selectTarget.options).forEach((opt) => (opt.hidden = false))
  }
}