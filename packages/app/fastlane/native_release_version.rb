require "json"
require "open3"

# packages/app/native-release-version.js is the single definition of the native
# version math (see docs/android.md). Shelling out to it is deliberate: a Ruby
# reimplementation would be a second definition that drifts silently.
module NativeReleaseVersion
  module_function

  SCRIPT = <<~JS.freeze
    const appRoot = process.argv[1];
    const { getNativeReleaseVersion } = require(appRoot + "/native-release-version");
    const { version } = require(appRoot + "/package.json");
    process.stdout.write(JSON.stringify(getNativeReleaseVersion(version)));
  JS

  def read(app_root)
    stdout, stderr, status = Open3.capture3("node", "-e", SCRIPT, app_root)
    unless status.success?
      raise "native-release-version.js failed for #{app_root}: #{stderr.strip}"
    end

    JSON.parse(stdout)
  end
end
