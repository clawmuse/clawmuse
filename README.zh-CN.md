# ClawMuse

用手机、浏览器和桌面客户端管理本机的 AI 编程 Agent。Daemon 运行在你的开发环境中。

本仓库公开客户端、本地 daemon、CLI、SDK、协议、插件及设备端加密通信代码。
云服务、云端 relay、计费系统和生产部署配置保持私有；使用托管功能仍需要对应的服务及账号。

## 开发

使用 Node.js 22 和 npm；Windows 下使用 Git Bash 运行开发脚本。

```sh
npm ci
npm run build:server
npm run build:app-deps
npm run typecheck
npm run lint
npm run dev
# 另开终端
npm run dev:app
```

开发 daemon 使用 6768 端口，数据保存在 `.dev/paseo-home`。

## 构建

```sh
npm run build:web --workspace=@getpaseo/app
CLAWMUSE_UNSIGNED_BUILD=1 CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:desktop -- --publish never
npm run build:apk:arm64
npm run ios
```

Android 构建需要 JDK 17 和 Android SDK；iOS 构建需要 macOS、Xcode 和 CocoaPods。
GitHub Actions 使用标准托管 Runner，提供 Linux、Windows、macOS 构建产物。
Mobile Builds 可手动构建 Android 调试 APK 和 iOS 模拟器应用。
这些产物用于开发验证，不包含生产签名或公证，关闭自动更新，不会提交到应用商店。

详见 [README](README.md)、[开源边界](docs/source-scope.md) 和 [贡献说明](CONTRIBUTING.md)。
本项目基于 Paseo，遵循 Apache-2.0；保留原作者署名、LICENSE、NOTICE 及第三方声明。
