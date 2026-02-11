class FormFillPolicy < ApplicationPolicy
  class Scope < Scope
    def resolve
      # Check user role level through the association
      if user && (user.admin? || user.developer?)
        scope.all
      else
        # Users can only access form fills for inspections they own
        scope.joins(:inspection).where(inspections: { user_id: user.id })
      end
    end
  end

  def show?
    user&.admin? || user&.developer? || record.inspection&.user_id == user.id
  end

  def create?
    admin_or_developer?
  end

  def update?
    user&.admin? || user&.developer? || record.inspection&.user_id == user.id
  end

  def destroy?
    admin_or_developer?
  end

  # Custom action for sending emails
  def send_email?
    # Allow users to send emails for their own inspections or admins for all
    user&.admin? || user&.developer? || record.inspection&.user_id == user.id
  end

  # Additional actions that might be needed
  def download_pdf?
    show?
  end

  def submit_form?
    update?
  end

  def generate_pdf_now?
    update?
  end
end
