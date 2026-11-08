## fastlane documentation

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## iOS

### ios prepare_release_version

```sh
[bundle exec] fastlane ios prepare_release_version
```

Resolve the iOS release version and next TestFlight build number

### ios build_and_upload

```sh
[bundle exec] fastlane ios build_and_upload
```

Build, sign, and upload ClawMuse to App Store Connect / TestFlight

### ios distribute_internal_testflight

```sh
[bundle exec] fastlane ios distribute_internal_testflight
```

Wait for and distribute an uploaded build to internal TestFlight testers

### ios distribute_testflight

```sh
[bundle exec] fastlane ios distribute_testflight
```

Wait for and distribute an uploaded build to external TestFlight testers

### ios submit_review

```sh
[bundle exec] fastlane ios submit_review
```

Submit the latest TestFlight build to App Store Review

---

## Android

### android upload_screenshots

```sh
[bundle exec] fastlane android upload_screenshots
```

Replace the Google Play store screenshots with the ones in the repo

---

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
