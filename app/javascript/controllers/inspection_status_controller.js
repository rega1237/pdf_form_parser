import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static values = { inspectionId: Number };

  updateStatus(event) {
    const status =
      event.target.dataset.status || event.currentTarget.dataset.status;

    if (
      confirm("Are you sure you want to change the status of this inspection?")
    ) {
      fetch(`/inspections/${this.inspectionIdValue}/update_status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": document.querySelector('[name="csrf-token"]').content,
        },
        body: JSON.stringify({ status: status }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.success) {
            location.reload();
          } else {
            alert("Error: " + data.errors.join(", "));
          }
        })
        .catch((error) => {
          console.error("Error:", error);
          alert("An error occurred while updating the status.");
        });
    }
  }
}
