# 设备预览

在主机的插件列表启用「设备预览」，进入工作区后从 Command Center 搜索「打开设备预览」。设备来自当前工作区连接的 daemon 主机。手机只观看 RPC 返回的 JPEG，不连接主机的回环地址。

| 主机条件                                      | 可用功能                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| Android SDK 中同时存在 adb、emulator          | 已配置 AVD 列表、启动、低频截图、单指点击和滑动、返回、Home、最近任务、旋转、明暗模式 |
| Apple Silicon Mac，Xcode 的 xcrun simctl 可用 | 可用模拟器列表、启动、低频截图、明暗模式                                              |
| Intel Mac、非 macOS 主机                      | iOS 显示不可用；Android 按 SDK 探测结果显示                                           |
| 缺少对应工具                                  | 该平台显示原因，不影响 daemon 启动                                                    |

Android SDK 从 ANDROID_HOME、ANDROID_SDK_ROOT 或系统默认 SDK 目录探测。列表不会启动模拟器或下载组件。真机、非 emulator 序列号、同一 AVD 的多个实例不参与预览；无法确认归属的运行实例会阻止启动可能重复的 AVD。

启动返回 preparing，面板轮询状态和截图。每次截图结束后等待 750ms 再请求，慢主机会降低刷新率。同一平台和设备只能被一个面板占用，最近一次截图轮询过去 30 秒后自动释放。状态查询和输入不会延长占用。切换设备、取消、停止、面板卸载和手机进入后台均结束观看；迟到的连接结果会被停止。

停止与插件卸载都不执行模拟器 shutdown、adb kill-server 或 emulator kill。新启动的 Android 模拟器也会继续运行。插件只取消并等待自己的工具命令进程树，不接管模拟器进程的生命周期。插件启用不会安装 Xcode、SDK、镜像或 App，也不会创建 AVD。

iOS 没有触摸注入，不提供点击、滑动、Home、音量或摇一摇。Android 仅支持单指点击和滑动；两端都没有双指及以上手势、键盘转发、Deep Link、剪贴板、音频、真机或 MCP 工具。

命令只通过 argv 执行。设备 id 必须通过契约验证并来自最近的列表；Android 控制前重新核对运行实例与 AVD 的对应关系。截图命令输出上限 16 MiB，像素上限 1200 万，JPEG 长边先缩到 960px，再按需减小，最终小于 512 KiB。base64 加 RPC 包装小于 704 KiB，低于当前 daemon 的 100 MiB 和 relay 的 32 MiB 消息上限（`packages/protocol/src/websocket-message-limit.ts`）。RPC 契约位于 `shared/contracts.ts`；SDK 要求小写方法名，因此使用 `device-preview.*`。

iOS 截图使用插件私有的临时目录，读取前检查大小，完成和取消后删除；部分 Xcode 版本会把 stdout 参数 `-` 当作文件名，不能依赖它。PNG/JPEG 编解码使用纯 JavaScript 的 pngjs 与 jpeg-js。没有 Lody 源码、iframe、流媒体运行时、scrcpy、Baguette 或原生 helper。

从仓库根目录运行不依赖 SDK 的验证：

```sh
npm run typecheck --workspace=@getpaseo/builtin-plugins
npx vitest run plugins/device-preview --bail=1
npm run lint -- plugins/device-preview packages/server/src/server/plugins/builtin/index.ts scripts/trace-daemon.mjs
```

手动验收需要在有对应 SDK 的主机启用插件：确认只读列表、启动和取消、首帧、手机远程画面、Android 单指输入、明暗模式、两个面板的占用冲突，以及停止和禁用后模拟器仍运行。无 SDK 的自动测试不能替代这些操作。
