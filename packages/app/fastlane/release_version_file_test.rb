require "minitest/autorun"
require "tmpdir"
require_relative "release_version_file"

class ReleaseVersionFileTest < Minitest::Test
  def test_renders_the_handoff_the_release_script_reads
    parsed = JSON.parse(ReleaseVersionFile.render(version: " 0.8.0 ", build_number: " 8000001 "))

    assert_equal({ "version" => "0.8.0", "buildNumber" => "8000001" }, parsed)
  end

  # app.config.js throws on anything else, which would only surface after the
  # much slower prebuild.
  def test_rejects_a_build_number_app_config_js_would_refuse
    assert_raises(ArgumentError) { ReleaseVersionFile.render(version: "0.8.0", build_number: "0") }
    assert_raises(ArgumentError) { ReleaseVersionFile.render(version: "0.8.0", build_number: "1.2") }
    assert_raises(ArgumentError) { ReleaseVersionFile.render(version: "0.8.0", build_number: "") }
    assert_raises(ArgumentError) { ReleaseVersionFile.render(version: "", build_number: "8000001") }
  end

  def test_round_trips_through_a_file_it_creates_the_directory_for
    Dir.mktmpdir do |root|
      path = File.join(root, "build", "ios-release-version.json")

      ReleaseVersionFile.write(path, version: "0.8.0", build_number: "8000001")

      assert_equal({ "version" => "0.8.0", "buildNumber" => "8000001" }, ReleaseVersionFile.read(path))
    end
  end
end
