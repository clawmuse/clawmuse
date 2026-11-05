# Ported from the EndToAI/Orca fork (`agent/mobile/fastlane/ios_release_version_test.rb`),
# trimmed to what this fork still decides: the version comes from package.json,
# so only the closed-train guard and the build number are resolved here.
require "minitest/autorun"
require_relative "ios_release_version"

class IosReleaseVersionTest < Minitest::Test
  # A shipped version closes every version at or below it, even ones that never
  # got an App Store record of their own.
  def test_versions_at_or_below_the_highest_closed_version_are_closed
    assert(IosReleaseVersion.closed_train?("0.0.34", "0.0.35"))
    assert(IosReleaseVersion.closed_train?("0.0.35", "0.0.35"))
    refute(IosReleaseVersion.closed_train?("0.0.36", "0.0.35"))
  end

  def test_nothing_is_closed_without_a_known_closed_version
    refute(IosReleaseVersion.closed_train?("0.0.1", nil))
    refute(IosReleaseVersion.closed_train?("0.0.1", ""))
  end

  def test_non_semver_candidates_are_treated_as_open
    refute(IosReleaseVersion.closed_train?("0.0", "0.0.35"))
  end

  # Minor/major releases must close stale patch trains beneath them.
  def test_closed_train_compares_across_minor_and_major
    assert(IosReleaseVersion.closed_train?("0.0.99", "0.1.0"))
    assert(IosReleaseVersion.closed_train?("0.9.9", "1.0.0"))
    refute(IosReleaseVersion.closed_train?("1.0.1", "1.0.0"))
  end

  def test_max_version_compares_numerically_not_lexically
    assert_equal("0.0.10", IosReleaseVersion.max_version(%w[0.0.9 0.0.10 0.0.2]))
    assert_equal("0.2.0", IosReleaseVersion.max_version(%w[0.1.99 0.2.0]))
    assert_equal("1.0.0", IosReleaseVersion.max_version(%w[0.9.9 1.0.0]))
  end

  def test_max_version_ignores_non_semver_entries
    assert_equal("0.0.35", IosReleaseVersion.max_version(["0.0.35", "1.0", "", nil]))
    assert_nil(IosReleaseVersion.max_version([]))
    assert_nil(IosReleaseVersion.max_version(nil))
  end

  # The derived number is what app.config.js would use on its own, and what
  # F-Droid/Android reproduce from the repo, so it is kept whenever Apple will
  # take it.
  def test_keeps_the_derived_build_number_for_a_fresh_version
    assert_equal("8000001", IosReleaseVersion.next_build_number(derived: "8000001", latest_testflight: 0))
    assert_equal("8000001", IosReleaseVersion.next_build_number(derived: "8000001", latest_testflight: nil))
    assert_equal("8000001", IosReleaseVersion.next_build_number(derived: "8000001", latest_testflight: "8000000"))
  end

  # A retried or re-signed release of the same marketing version needs a higher
  # CFBundleVersion or App Store Connect rejects the upload.
  def test_steps_past_a_build_number_testflight_already_holds
    assert_equal("8000002", IosReleaseVersion.next_build_number(derived: "8000001", latest_testflight: "8000001"))
    assert_equal("8000010", IosReleaseVersion.next_build_number(derived: "8000001", latest_testflight: 8_000_009))
  end

  def test_rejects_a_derived_build_number_that_is_not_a_positive_integer
    assert_raises(ArgumentError) { IosReleaseVersion.next_build_number(derived: "0", latest_testflight: 0) }
    assert_raises(ArgumentError) { IosReleaseVersion.next_build_number(derived: "abc", latest_testflight: 0) }
  end
end
