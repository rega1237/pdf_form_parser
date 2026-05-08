require "test_helper"

class PathSanitizerTest < ActiveSupport::TestCase
  test "should allow safe paths inside Rails root" do
    safe_path = Rails.root.join("tmp", "test.pdf")
    assert_equal safe_path.to_s, PathSanitizer.ensure_safe_path!(safe_path).to_s
  end

  test "should allow safe paths inside tmp" do
    safe_path = "/tmp/test.pdf"
    assert_equal safe_path, PathSanitizer.ensure_safe_path!(safe_path)
  end

  test "should raise error for unsafe paths trying traversal" do
    unsafe_path = "/etc/passwd"
    assert_raises(SecurityError) do
      PathSanitizer.ensure_safe_path!(unsafe_path)
    end
  end

  test "should allow paths inside system temporary directory" do
    temp_path = File.join(Dir.tmpdir, "test.pdf")
    assert_equal temp_path, PathSanitizer.ensure_safe_path!(temp_path)
  end
end
