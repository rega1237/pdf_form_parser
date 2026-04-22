require "test_helper"

class InspectionTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  setup do
    @inspection = inspections(:one)
  end

  test "should be valid" do
    assert @inspection.valid?
  end

  test "should require a date" do
    @inspection.date = nil
    assert_not @inspection.valid?
  end

  test "should require a property" do
    @inspection.property = nil
    assert_not @inspection.valid?
  end

  test "customer_name should return property customer name" do
    assert_equal @inspection.property.customer.name, @inspection.customer_name
  end

  test "property_address should return property address" do
    assert_equal @inspection.property.address, @inspection.property_address
  end

  test "by_customer scope should return inspections for customer" do
    customer = customers(:one)
    assert_includes Inspection.by_customer(customer), inspections(:one)
  end

  test "by_date_range scope should return inspections within range" do
    start_date = Date.parse("2025-01-01")
    end_date = Date.parse("2025-01-31")
    assert_includes Inspection.by_date_range(start_date, end_date), inspections(:one)
  end

  test "completing inspection should enqueue deficiency transfer job" do
    @inspection.status = "in_progress"
    @inspection.save!

    assert_enqueued_with(job: TransferDeficienciesJob, args: [ @inspection.id ]) do
      @inspection.update!(status: "completed")
    end
  end
end
