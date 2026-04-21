require 'test_helper'

class FormTemplatePolicyTest < ActiveSupport::TestCase
  setup do
    @dev_role = roles(:developer)
    @admin_role = roles(:admin)
    
    @developer = User.create!(email: 'dev_ft@test.com', password: 'password', role: @dev_role)
    @admin = User.create!(email: 'admin_ft@test.com', password: 'password', role: @admin_role)
    
    @form_template = form_templates(:one)
  end

  def test_scope
    # Developer should see all
    assert_includes FormTemplatePolicy::Scope.new(@developer, FormTemplate.all).resolve, @form_template
    
    # Admin should see none (based on policy logic)
    refute_includes FormTemplatePolicy::Scope.new(@admin, FormTemplate.all).resolve, @form_template
  end

  def test_show
    assert FormTemplatePolicy.new(@developer, @form_template).show?
    refute FormTemplatePolicy.new(@admin, @form_template).show?
  end

  def test_create
    assert FormTemplatePolicy.new(@developer, @form_template).create?
    refute FormTemplatePolicy.new(@admin, @form_template).create?
  end

  def test_update
    assert FormTemplatePolicy.new(@developer, @form_template).update?
    refute FormTemplatePolicy.new(@admin, @form_template).update?
  end

  def test_destroy
    assert FormTemplatePolicy.new(@developer, @form_template).destroy?
    refute FormTemplatePolicy.new(@admin, @form_template).destroy?
  end
end
