require "test_helper"

class UserTest < ActiveSupport::TestCase
  setup do
    @user = users(:one)
  end

  test "should be valid" do
    assert @user.valid?
  end

  test "should require email" do
    @user.email = ""
    assert_not @user.valid?
  end

  test "active scope should return only active users" do
    active_users = User.active
    assert active_users.include?(users(:one))

    users(:two).update(is_active: false)
    active_users = User.active
    assert_not active_users.include?(users(:two))
  end

  test "inactive scope should return only inactive users" do
    users(:two).update(is_active: false)
    inactive_users = User.inactive
    assert inactive_users.include?(users(:two))
    assert_not inactive_users.include?(users(:one))
  end

  test "deactivate! should set is_active to false" do
    @user.deactivate!
    assert_not @user.is_active
  end

  test "activate! should set is_active to true" do
    @user.update(is_active: false)
    @user.activate!
    assert @user.is_active
  end

  test "display_name should return name if present" do
    @user.name = "John Doe"
    assert_equal "John Doe", @user.display_name
  end

  test "display_name should return email if name is blank" do
    @user.name = ""
    assert_equal @user.email, @user.display_name
  end

  test "admin? should return true if role level is Admin" do
    @user.role = roles(:admin)
    assert @user.admin?
  end

  test "developer? should return true if role level is Developer" do
    @user.role = roles(:developer)
    assert @user.developer?
  end

  test "technician? should return true if role level is Technician" do
    tech_role = Role.create!(level: "Technician")
    @user.role = tech_role
    assert @user.technician?
  end
end
