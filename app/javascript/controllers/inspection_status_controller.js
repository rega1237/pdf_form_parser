import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static values = { inspectionId: Number };

  /**
   * Actualiza el estado de una inspección mediante una solicitud PATCH.
   * Maneja la confirmación, interacción con la API, activación de sincronización y redirección.
   * @param {Event} event - El evento que activó la actualización de estado (p.ej., clic).
   */
  updateStatus(event) {
    // Prevent any default behavior or other handlers from triggering
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const el = event.currentTarget || event.target;
    const status = el.dataset.status || event.target.dataset.status;
    const redirect = el.dataset.redirect || null; // 'index' to go to list

    // Ensure we have an inspection id
    const inspectionId = this.inspectionIdValue || el.dataset.inspectionId;
    if (!inspectionId) {
      console.error("Missing inspection id for status update");
      alert("Cannot update status: missing inspection id.");
      return;
    }

    if (
      confirm("Are you sure you want to change the status of this inspection?")
    ) {
      // Force JSON format to avoid HTML redirects
      const url = `/inspections/${inspectionId}/update_status.json`;

      fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-CSRF-Token": document.querySelector('[name="csrf-token"]').content,
          "X-Requested-With": "XMLHttpRequest",
        },
        credentials: "same-origin",
        body: JSON.stringify({ status: status }),
        redirect: "follow",
      })
        .then((response) => {
          if (!response.ok) {
            // Try to parse JSON error if available
            return response.json().catch(() => {
              throw new Error(`Request failed with status ${response.status}`);
            });
          }
          return response.json();
        })
        .then((data) => {
          if (data && data.success) {
            const redirectToIndex = redirect === "index";
            const doRedirect = () => {
              if (redirectToIndex) {
                window.location.href = "/inspections";
              } else {
                window.location.reload();
              }
            };

            try {
              const primary = window.__syncPrimary;
              const globalSync = window.__syncGlobal || { isSyncing: false };
              if (primary && typeof primary.startSync === "function") {
                // Start sync and wait briefly for completion before redirecting
                primary.startSync();
                let waited = 0;
                const maxWaitMs = 8000; // fallback redirect after 8s
                const interval = setInterval(() => {
                  waited += 500;
                  if (!globalSync.isSyncing || waited >= maxWaitMs) {
                    clearInterval(interval);
                    doRedirect();
                  }
                }, 500);
              } else {
                doRedirect();
              }
            } catch (error) {
              console.warn("Sync trigger failed, redirecting:", error);
              doRedirect();
            }
          } else {
            const errors = (data && data.errors) || [];
            alert("Error: " + errors.join(", "));
          }
        })
        .catch((error) => {
          console.error("Error:", error);
          alert("An error occurred while updating the status.");
        });
    }
  }
}
