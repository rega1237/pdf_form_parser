# Pin npm packages by running ./bin/importmap

pin "application"
pin "@hotwired/turbo-rails", to: "turbo.min.js"
pin "@hotwired/stimulus", to: "stimulus.min.js"
pin "@hotwired/stimulus-loading", to: "stimulus-loading.js"
pin "sortablejs" # @1.15.6
pin "@rails/ujs", to: "rails-ujs.js"
pin "flatpickr" # @4.6.13

pin_all_from "app/javascript/controllers", under: "controllers"

pin "utils/offline_storage", to: "utils/offline_storage.js"
pin "utils/network_status", to: "utils/network_status.js"
pin "trix"
pin "@rails/actiontext", to: "actiontext.esm.js"
