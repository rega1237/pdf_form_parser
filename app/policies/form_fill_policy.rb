class FormFillPolicy < ApplicationPolicy
  class Scope < Scope
    def resolve
      # Check user role level through the association
      if user && user.role&.level == 'Admin'
        scope.all
      else
        # Users can only access form fills for inspections they own
        scope.joins(:inspection).where(inspections: { user_id: user.id })
      end
    end
  end

  def show?
    user&.role&.level == 'Admin' || record.inspection&.user_id == user.id
  end

  def create?
    user && user.role&.level == 'Admin'
  end

  def update?
    user&.role&.level == 'Admin' || record.inspection&.user_id == user.id
  end

  def destroy?
    user && user.role&.level == 'Admin'
  end

  # Custom action for sending emails
  def send_email?
    # Allow users to send emails for their own inspections or admins for all
    user&.role&.level == 'Admin' || record.inspection&.user_id == user.id
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
