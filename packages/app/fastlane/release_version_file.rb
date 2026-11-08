require "fileutils"
require "json"

# Replaces the Orca fork's app.json rewriting. app.config.js reads the build
# number from CLAWMUSE_IOS_BUILD_NUMBER, so the release never edits a tracked
# file; prepare_release_version leaves this handoff under the gitignored build/
# directory and release-ios-local.sh exports it before prebuild.
module ReleaseVersionFile
  module_function

  BUILD_NUMBER_PATTERN = /\A[1-9][0-9]*\z/.freeze

  def render(version:, build_number:)
    version = version.to_s.strip
    build_number = build_number.to_s.strip
    raise ArgumentError, "version is required" if version.empty?
    unless build_number.match?(BUILD_NUMBER_PATTERN)
      # app.config.js rejects anything else, and it would only fail after the
      # much slower prebuild.
      raise ArgumentError, "build number must be a positive integer: '#{build_number}'"
    end

    "#{JSON.pretty_generate({ "version" => version, "buildNumber" => build_number })}\n"
  end

  def write(path, version:, build_number:)
    contents = render(version: version, build_number: build_number)
    FileUtils.mkdir_p(File.dirname(path))
    File.write(path, contents)
    path
  end

  def read(path)
    JSON.parse(File.read(path))
  end
end
