const { withPodfile } = require("expo/config-plugins");

const REACT_NATIVE_POST_INSTALL_END =
  "      :ccache_enabled => ccache_enabled?(podfile_properties),\n    )";
const DEPLOYMENT_TARGET_FLOOR = `    # Xcode 27 rejects pod targets whose declared deployment target is below
    # iOS 15; floor them at the project minimum.
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        current = config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || Gem::Version.new(current) < Gem::Version.new('15.1')
          config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
        end
      end
    end`;

function configurePodfileDeploymentFloor(contents) {
  if (contents.includes(DEPLOYMENT_TARGET_FLOOR)) {
    return contents;
  }
  if (!contents.includes(REACT_NATIVE_POST_INSTALL_END)) {
    throw new Error("Could not find react_native_post_install call in Podfile");
  }
  return contents.replace(
    REACT_NATIVE_POST_INSTALL_END,
    `${REACT_NATIVE_POST_INSTALL_END}\n${DEPLOYMENT_TARGET_FLOOR}`,
  );
}

function withIosDeploymentFloor(config) {
  return withPodfile(config, (modConfig) => {
    modConfig.modResults.contents = configurePodfileDeploymentFloor(modConfig.modResults.contents);
    return modConfig;
  });
}

module.exports = withIosDeploymentFloor;
module.exports.configurePodfileDeploymentFloor = configurePodfileDeploymentFloor;
