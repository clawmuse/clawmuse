#!/usr/bin/env bash
set -euo pipefail
apk="$(realpath "${1:?Expected the standalone APK path}")"
evidence="$(pwd)/artifacts/android-installer-smoke"
mkdir -p "$evidence"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
[ -e /dev/kvm ] || { echo 'Android emulator requires KVM on this runner.' >&2; exit 1; }
sudo chmod 666 /dev/kvm
set +o pipefail
yes | sdkmanager --licenses > "$evidence/sdk-licenses.log"
set -o pipefail
sdkmanager 'platform-tools' 'emulator' 'system-images;android-35;google_apis;x86_64' > "$evidence/sdk-install.log"
echo no | avdmanager create avd --force --name clawmuse-installer-qa --package 'system-images;android-35;google_apis;x86_64'
emulator -avd clawmuse-installer-qa -port 5554 -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader -cores 2 -memory 2048 > "$evidence/emulator.log" 2>&1 &
emulator_pid=$!
cleanup() {
  adb -s emulator-5554 logcat -d > "$evidence/logcat.txt" 2>/dev/null || true
  adb -s emulator-5554 emu kill >/dev/null 2>&1 || true
  kill "$emulator_pid" 2>/dev/null || true
}
trap cleanup EXIT
timeout 180 adb -s emulator-5554 wait-for-device
deadline=$((SECONDS + 180))
until [ "$(adb -s emulator-5554 shell getprop sys.boot_completed | tr -d '\r')" = 1 ]; do
  [ "$SECONDS" -lt "$deadline" ] || { echo 'Emulator boot timed out.' >&2; exit 1; }
  sleep 2
done
adb -s emulator-5554 shell input keyevent 82
adb -s emulator-5554 shell settings put global window_animation_scale 0
adb -s emulator-5554 shell settings put global transition_animation_scale 0
adb -s emulator-5554 shell settings put global animator_duration_scale 0
adb -s emulator-5554 install "$apk"
adb -s emulator-5554 logcat -c
adb -s emulator-5554 shell am start -W -n com.clawmuse/.MainActivity | tee "$evidence/launch.txt"
sleep 20
adb -s emulator-5554 shell dumpsys activity activities > "$evidence/activities.txt"
adb -s emulator-5554 logcat -d > "$evidence/logcat.txt"
adb -s emulator-5554 exec-out screencap -p > "$evidence/startup.png"
adb -s emulator-5554 shell uiautomator dump /sdcard/clawmuse-startup.xml
adb -s emulator-5554 pull /sdcard/clawmuse-startup.xml "$evidence/startup.xml"
if grep -E 'FATAL EXCEPTION|Unable to load script|Could not get BatchedBridge|Invariant Violation' "$evidence/logcat.txt"; then
  echo 'The release APK failed to start independently.' >&2
  exit 1
fi
python3 - "$evidence" <<'PY'
import pathlib, sys, xml.etree.ElementTree as ET
root=pathlib.Path(sys.argv[1])
activity=(root/'activities.txt').read_text()
assert any('com.clawmuse/.MainActivity' in line and ('ResumedActivity' in line or 'mResumedActivity' in line) for line in activity.splitlines()), 'ClawMuse is not the resumed activity'
tree=ET.parse(root/'startup.xml')
texts=[node.attrib.get('text','').strip() for node in tree.iter('node') if node.attrib.get('package')=='com.clawmuse']
assert any(texts), 'The standalone APK did not render application text'
print('Release APK installed and rendered its interface without Metro or a local daemon.')
PY
