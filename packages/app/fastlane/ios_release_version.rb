# Ported from the EndToAI/Orca fork (`agent/mobile/fastlane/ios_release_version.rb`).
# The marketing version itself is not decided here: it comes from
# packages/app/package.json through native-release-version.js. What is decided
# here is whether App Store Connect will accept it, and which build number to use.
module IosReleaseVersion
  module_function

  SEMVER_PATTERN = /\A(\d+)\.(\d+)\.(\d+)\z/.freeze

  # [major, minor, patch] for semver comparison, or nil for anything else.
  def parse(version)
    match = version.to_s.strip.match(SEMVER_PATTERN)
    return nil unless match

    [match[1].to_i, match[2].to_i, match[3].to_i]
  end

  # Highest semver in `versions`, skipping entries App Store Connect reports in
  # a non-semver shape. Compares numerically: "0.0.10" beats "0.0.9", which a
  # string sort gets backwards.
  def max_version(versions)
    Array(versions)
      .map { |version| version.to_s.strip }
      .select { |version| parse(version) }
      .max_by { |version| parse(version) }
  end

  # Apple rejects an upload whose CFBundleShortVersionString is not higher than
  # the last approved version (90062) and reports that version's train as closed
  # (90186). So every version at or below `highest_closed` is unusable, not just
  # the ones whose own App Store record sits in a closed state.
  def closed_train?(version, highest_closed)
    candidate = parse(version)
    ceiling = parse(highest_closed)
    return false unless candidate && ceiling

    (candidate <=> ceiling) <= 0
  end

  # native-release-version.js derives one build number per release, which is the
  # value app.config.js uses when CLAWMUSE_IOS_BUILD_NUMBER is unset. It is only
  # wrong when this exact marketing version was already uploaded — a retried or
  # re-signed release — so the derived number is kept unless TestFlight already
  # holds it.
  def next_build_number(derived:, latest_testflight:)
    derived_number = Integer(derived.to_s.strip, 10)
    raise ArgumentError, "Derived build number must be positive: #{derived}" unless derived_number.positive?

    uploaded = latest_testflight.to_s.strip
    uploaded_number = uploaded.match?(/\A\d+\z/) ? uploaded.to_i : 0
    [derived_number, uploaded_number + 1].max.to_s
  end
end
