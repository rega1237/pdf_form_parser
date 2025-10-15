# Pin npm packages by running ./bin/importmap

pin 'application'
pin '@hotwired/turbo-rails', to: 'turbo.min.js'
pin '@hotwired/stimulus', to: 'stimulus.min.js'
pin '@hotwired/stimulus-loading', to: 'stimulus-loading.js'
pin 'sortablejs' # @1.15.6
pin '@rails/ujs', to: 'rails-ujs.js'
pin "flatpickr" # @4.6.13

pin "controllers/application", to: "controllers/application.js"
pin "controllers/category_selector_controller", to: "controllers/category_selector_controller.js"
pin "controllers/choice_buttons_controller", to: "controllers/choice_buttons_controller.js"
pin "controllers/customer_properties_controller", to: "controllers/customer_properties_controller.js"
pin "controllers/date_fix_controller", to: "controllers/date_fix_controller.js"
pin "controllers/datepicker_controller", to: "controllers/datepicker_controller.js"
pin "controllers/drag_controller", to: "controllers/drag_controller.js"
pin "controllers/email_sender_controller", to: "controllers/email_sender_controller.js"
pin "controllers/external_form_action_controller", to: "controllers/external_form_action_controller.js"
pin "controllers/field_toggle_controller", to: "controllers/field_toggle_controller.js"
pin "controllers/file_upload_controller", to: "controllers/file_upload_controller.js"
pin "controllers/flash_controller", to: "controllers/flash_controller.js"
pin "controllers/form_fill_controller", to: "controllers/form_fill_controller.js"
pin "controllers/hello_controller", to: "controllers/hello_controller.js"
pin "controllers", to: "controllers/index.js"
pin "controllers/inspection_download_controller", to: "controllers/inspection_download_controller.js"
pin "controllers/inspection_modal_controller", to: "controllers/inspection_modal_controller.js"
pin "controllers/inspection_status_controller", to: "controllers/inspection_status_controller.js"
pin "controllers/mobile_menu_controller", to: "controllers/mobile_menu_controller.js"
pin "controllers/notification_controller", to: "controllers/notification_controller.js"
pin "controllers/offline_form_controller", to: "controllers/offline_form_controller.js"
pin "controllers/offline_photo_controller", to: "controllers/offline_photo_controller.js"
pin "controllers/offline_status_controller", to: "controllers/offline_status_controller.js"
pin "controllers/page_navigation_controller", to: "controllers/page_navigation_controller.js"
pin "controllers/pagination_controller", to: "controllers/pagination_controller.js"
pin "controllers/pdf_status_controller", to: "controllers/pdf_status_controller.js"
pin "controllers/photo_capture_controller", to: "controllers/photo_capture_controller.js"
pin "controllers/pwa_controller", to: "controllers/pwa_controller.js"
pin "controllers/searchable_select_controller", to: "controllers/searchable_select_controller.js"
pin "controllers/sync_controller", to: "controllers/sync_controller.js"

pin "utils/offline_storage", to: "utils/offline_storage.js"
pin "utils/network_status", to: "utils/network_status.js"
