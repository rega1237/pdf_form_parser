require 'test_helper'

class FormFillPolicyTest < ActiveSupport::TestCase
  setup do
    @admin_role = Role.find_or_create_by!(level: 'Admin')
    @dev_role = Role.find_or_create_by!(level: 'Developer')
    @tech_role = Role.find_or_create_by!(level: 'Technician')

    @admin = User.create!(email: 'admin_ff_policy@test.com', password: 'password', role: @admin_role)
    @developer = User.create!(email: 'dev_ff_policy@test.com', password: 'password', role: @dev_role)
    @technician = User.create!(email: 'tech_ff_policy@test.com', password: 'password', role: @tech_role)
    @other_tech = User.create!(email: 'other_ff_policy@test.com', password: 'password', role: @tech_role)

    @inspection = inspections(:one)
    @inspection.update!(user: @technician)
    
    @form_fill = form_fills(:one)
    @form_fill.update!(inspection: @inspection)
  end

  def test_scope
    # Admin/Developer should see all
    assert_includes FormFillPolicy::Scope.new(@admin, FormFill.all).resolve, @form_fill
    assert_includes FormFillPolicy::Scope.new(@developer, FormFill.all).resolve, @form_fill
    
    # Technician should see their own
    assert_includes FormFillPolicy::Scope.new(@technician, FormFill.all).resolve, @form_fill
    
    # Other tech should see none (of this one)
    refute_includes FormFillPolicy::Scope.new(@other_tech, FormFill.all).resolve, @form_fill
  end

  def test_show
    assert FormFillPolicy.new(@admin, @form_fill).show?
    assert FormFillPolicy.new(@developer, @form_fill).show?
    assert FormFillPolicy.new(@technician, @form_fill).show?
    refute FormFillPolicy.new(@other_tech, @form_fill).show?
  end

  def test_create
    assert FormFillPolicy.new(@admin, FormFill).create?
    assert FormFillPolicy.new(@developer, FormFill).create?
    refute FormFillPolicy.new(@technician, FormFill).create?
  end

  def test_update
    assert FormFillPolicy.new(@admin, @form_fill).update?
    assert FormFillPolicy.new(@developer, @form_fill).update?
    assert FormFillPolicy.new(@technician, @form_fill).update?
    refute FormFillPolicy.new(@other_tech, @form_fill).update?
  end

  def test_destroy
    assert FormFillPolicy.new(@admin, @form_fill).destroy?
    assert FormFillPolicy.new(@developer, @form_fill).destroy?
    refute FormFillPolicy.new(@technician, @form_fill).destroy?
  end

  def test_send_email
    assert FormFillPolicy.new(@admin, @form_fill).send_email?
    assert FormFillPolicy.new(@developer, @form_fill).send_email?
    assert FormFillPolicy.new(@technician, @form_fill).send_email?
    refute FormFillPolicy.new(@other_tech, @form_fill).send_email?
  end

  def test_download_pdf
    assert FormFillPolicy.new(@admin, @form_fill).download_pdf?
    assert FormFillPolicy.new(@technician, @form_fill).download_pdf?
    refute FormFillPolicy.new(@other_tech, @form_fill).download_pdf?
  end
end
