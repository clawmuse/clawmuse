require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name = 'ClawMuseAgentLiveActivity'
  s.version = package['version']
  s.summary = package['description']
  s.description = package['description']
  s.license = package['license']
  s.author = package['author']
  s.homepage = 'https://github.com/clawmuse/clawmuse'
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.source = { git: 'https://github.com/clawmuse/clawmuse.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'ActivityKit', 'UserNotifications'
  s.source_files = '**/*.swift'
end
