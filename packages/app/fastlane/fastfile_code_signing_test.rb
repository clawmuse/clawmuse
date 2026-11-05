# Ported from the EndToAI/Orca fork
# (`agent/mobile/fastlane/fastfile_code_signing_test.rb`). `bundle exec fastlane
# lanes` parses the Fastfile without ever exercising the signing arguments, so
# the two-profile setup is pinned here as text.
require "minitest/autorun"

class FastfileCodeSigningTest < Minitest::Test
  FASTFILE = File.expand_path("Fastfile", __dir__).freeze
  SOURCE = File.read(FASTFILE).freeze

  def test_declares_the_live_activity_extension_identity
    assert_includes(
      SOURCE,
      'LIVE_ACTIVITY_EXTENSION_TARGET = "ClawMuseAgentLiveActivityExtension"',
    )
    assert_includes(
      SOURCE,
      'LIVE_ACTIVITY_EXTENSION_BUNDLE_ID = "#{BUNDLE_ID}.AgentLiveActivityExtension".freeze',
    )
  end

  def test_takes_the_app_identity_from_brand_json
    assert_includes(SOURCE, 'BUNDLE_ID = BRAND.fetch("iosBundleId")')
    assert_includes(SOURCE, "APP_IDENTIFIER = BUNDLE_ID")
    refute_includes(SOURCE, "sh.paseo")
  end

  def test_takes_the_app_store_connect_app_id_from_eas_json
    assert_includes(
      SOURCE,
      'ASC_APP_ID = EAS_CONFIG.fetch("submit").fetch("production").fetch("ios").fetch("ascAppId")',
    )
  end

  def test_uses_the_expo_name_for_the_generated_native_project
    assert_includes(SOURCE, 'NATIVE_PROJECT_NAME = BRAND.fetch("name").gsub(/[^A-Za-z0-9]/, "")')
    assert_includes(SOURCE, 'WORKSPACE = File.join(APP_ROOT, "ios", "#{NATIVE_PROJECT_NAME}.xcworkspace")')
    assert_includes(SOURCE, 'PROJECT = File.join(APP_ROOT, "ios", "#{NATIVE_PROJECT_NAME}.xcodeproj")')
    assert_includes(SOURCE, "SCHEME = NATIVE_PROJECT_NAME")
    assert_includes(SOURCE, "APP_TARGET = NATIVE_PROJECT_NAME")
  end

  # The build number reaches the native project through app.config.js, not
  # through an edit to a tracked file.
  def test_never_rewrites_a_tracked_config_to_carry_the_build_number
    assert_includes(SOURCE, "ReleaseVersionFile.write(RELEASE_VERSION_FILE")
    assert_includes(SOURCE, "NativeReleaseVersion.read(APP_ROOT)")
    refute_includes(SOURCE, "app.json")
  end

  def test_captures_each_profile_name_before_the_next_profile_lookup
    assert_match(
      /get_provisioning_profile\(
         .*?app_identifier:\s*BUNDLE_ID,
         .*?\)\s*
       app_profile_name\s*=\s*lane_context\[SharedValues::SIGH_NAME\]\s*
       get_provisioning_profile\(
         .*?app_identifier:\s*LIVE_ACTIVITY_EXTENSION_BUNDLE_ID,
         .*?\)\s*
       live_activity_extension_profile_name\s*=\s*lane_context\[SharedValues::SIGH_NAME\]/mx,
      SOURCE,
    )
  end

  def test_sets_a_distinct_profile_on_each_xcode_target
    assert_target_signing(
      bundle_identifier: "BUNDLE_ID",
      profile_name: "app_profile_name",
      target: "APP_TARGET",
    )
    assert_target_signing(
      bundle_identifier: "LIVE_ACTIVITY_EXTENSION_BUNDLE_ID",
      profile_name: "live_activity_extension_profile_name",
      target: "LIVE_ACTIVITY_EXTENSION_TARGET",
    )
  end

  def test_build_uses_the_dedicated_keychain_without_overriding_target_profiles
    build_call = SOURCE[/build_app\((.*?)\n\s*\)\n/m, 1]

    refute_nil(build_call, "expected a build_app call")
    assert_includes(SOURCE, 'ENV.fetch("CLAWMUSE_IOS_KEYCHAIN_PATH", "").strip')
    assert_includes(SOURCE, 'ENV.fetch("CLAWMUSE_IOS_SIGNING_IDENTITY", "Apple Distribution")')
    assert_includes(SOURCE, 'OTHER_CODE_SIGN_FLAGS=#{Shellwords.escape("--keychain #{keychain_path}")}')
    assert_includes(build_call, "codesigning_identity: signing_identity")
    assert_includes(build_call, "xcargs: keychain_xcargs")
    refute_includes(SOURCE, '"-jobs 1"')
    refute_includes(build_call, "export_xcargs:")
    refute_includes(build_call, "PROVISIONING_PROFILE_SPECIFIER")
  end

  def test_verifies_the_ipa_after_build_and_before_upload
    build_index = SOURCE.index("    build_app(")
    verify_index = SOURCE.index('"verify-ios-release-artifact.mjs"')
    upload_index = SOURCE.index("    upload_to_testflight(")

    refute_nil(build_index)
    refute_nil(verify_index)
    refute_nil(upload_index)
    assert_operator(build_index, :<, verify_index)
    assert_operator(verify_index, :<, upload_index)
  end

  def test_export_maps_both_bundle_identifiers_to_their_profiles
    assert_match(
      /provisioningProfiles:\s*\{\s*
         BUNDLE_ID\s*=>\s*app_profile_name,\s*
         LIVE_ACTIVITY_EXTENSION_BUNDLE_ID\s*=>\s*live_activity_extension_profile_name,\s*
       \}/mx,
      SOURCE,
    )
  end

  def test_export_uses_the_selected_signing_certificate
    assert_match(
      /export_options:\s*\{.*?signingCertificate:\s*signing_identity,/m,
      SOURCE,
    )
  end

  private

  def assert_target_signing(bundle_identifier:, profile_name:, target:)
    assert_match(
      /update_code_signing_settings\(
         .*?path:\s*PROJECT,
         .*?use_automatic_signing:\s*false,
         .*?bundle_identifier:\s*#{bundle_identifier},
         .*?sdk:\s*"iphoneos\*",
         .*?profile_name:\s*#{profile_name},
         .*?targets:\s*\[#{target}\],
         .*?build_configurations:\s*\["Release"\],
         .*?\)/mx,
      SOURCE,
    )
  end
end
