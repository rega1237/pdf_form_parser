require "test_helper"

class FormTemplateTest < ActiveSupport::TestCase
  setup do
    @template = form_templates(:one)
    # Ensure it has an attached file for validation if not already attached
    unless @template.original_file.attached?
      @template.original_file.attach(
        io: File.open(Rails.root.join("test/fixtures/files/test.pdf")),
        filename: "test.pdf",
        content_type: "application/pdf"
      )
    end
  end

  test "should be valid with attached file" do
    assert @template.valid?
  end

  test "should be invalid without attached file" do
    @template.original_file.detach
    assert_not @template.valid?
  end

  test "file_path should return blob path if attached" do
    path = @template.file_path
    assert_not_nil path
    assert path.include?("test.pdf")
  end

  test "updating form_structure should update associated form_fills" do
    form_fill = form_fills(:one)
    # Ensure form_fill is associated with this template
    form_fill.update!(form_template: @template)

    new_structure = { "new_field" => "value" }.to_json
    @template.update!(form_structure: new_structure)

    form_fill.reload
    assert_equal new_structure, form_fill.form_structure
  end
end
