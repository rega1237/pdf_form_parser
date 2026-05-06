## Stage 1: Bypass Active Storage Interception in Service Worker
Goal: Exclude all Active Storage requests from the Service Worker's programmatic fetch interception.
Success Criteria:
- `app/controllers/pwa_controller.rb` excludes paths starting with `/rails/active_storage` from `self.addEventListener('fetch')`.
Status: Complete

## Stage 2: Switch Image and Signature URLs to Same-Origin Proxies
Goal: Use Rails built-in Active Storage proxying instead of redirects for images and signatures to eliminate cross-origin CORS issues on programmatic fetches.
Success Criteria:
- `FormFill#get_photo_url_for_field` uses `rails_storage_proxy_path`.
- `FormFillsController#signature_url` uses `rails_storage_proxy_path`.
- `app/views/form_fills/_form_field.html.erb` renders photos and signatures using `rails_storage_proxy_path`.
Status: Complete

## Stage 3: Automated Testing and Verification
Goal: Validate that all tests pass and that correct proxy paths are generated.
Success Criteria:
- Entire test suite (`bundle exec rails test`) passes with 0 failures and 0 errors.
Status: Complete
