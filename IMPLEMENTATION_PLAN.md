## Stage 1: Data Model and Migration
Goal: Create the new `CustomerEmail` model and migrate existing data without loss.
Success Criteria:
- `CustomerEmail` model exists with `customer_id`, `address`, and `primary` (boolean) fields.
- Migration creates a `CustomerEmail` for every existing `Customer` that has an `email` string.
- Tests verify the model works.
Status: Not Started

## Stage 2: Update Customer Model and Backward Compatibility
Goal: Enable `Customer` to have many emails while keeping existing references working temporarily.
Success Criteria:
- `Customer` `has_many :customer_emails`.
- `Customer` accepts nested attributes for `customer_emails`.
- `Customer#email` method returns the primary email address, ensuring places calling `@customer.email` don't break immediately during transition.
Status: Not Started

## Stage 3: Forms and Views
Goal: Allow users to add/edit/remove multiple emails in the UI.
Success Criteria:
- `CustomersController` permits `customer_emails_attributes`.
- `app/views/customers/_form.html.erb` handles multiple email fields (using Nested Attributes, potentially with a small Stimulus controller to add/remove dynamically).
- Display views (`show`, `index`) updated to show the primary or all emails correctly.
Status: Not Started

## Stage 4: Cleaning up specific usages and Tests
Goal: Ensure all system calls and automated tests correctly handle the new email structure.
Success Criteria:
- Services like `EmailService` and controllers like `FormFillsController` correctly use the primary email or allow choosing one.
- All MiniTest tests (`test/models/customer_test.rb`, `test/controllers/customers_controller_test.rb`, etc.) pass and cover the new behavior.
Status: Not Started

## User Review Required
> [!IMPORTANT]
> The plan proposes a `CustomerEmail` model instead of simply changing `email` to an array column (`text[]`). Using a separate model is the standard, robust Rails approach because it allows marking one email as "primary" and provides a cleaner path for UI integration (Nested Forms). Wait for user approval before proceeding.

## Verification Plan
### Automated Tests
- Run `rails test test/models/customer_test.rb` and `rails test test/models/customer_email_test.rb` to verify associations and methods.
- Run `rails test test/controllers/customers_controller_test.rb` to verify nested form submission works correctly.
- Run `rails test` on the entire test suite to ensure no regressions in places calling customer emails.

### Manual Verification
1. Open the application locally and go to the Customers list.
2. Edit an existing customer and verify their existing email is populated in the first email field.
3. Test adding a second email, saving, and verifying both are saved.
4. Try generating/sending a PDF form to verify the `EmailService` still picks up the correct primary email.
