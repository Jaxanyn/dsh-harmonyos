# dsh-harmonyos-plugin

DeepSeek Harness 的 HarmonyOS 插件。插件通过 HDC 连接纯 HarmonyOS 设备，在对话中完成设备发现、实时预览、截图、交互，以及 Stage 项目的构建、安装和启动。

界面结构参考 [dsh-android](https://github.com/ZSeven-W/dsh-android)：工具结果显示在对话中，设备画面显示在右侧持久化面板。设备控制和构建流程使用 HarmonyOS 对应的 HDC、Hvigor 与 Ability 命令。

## 功能

- 列出 HDC 已连接的 HarmonyOS 设备。
- 启动、停止和查看实时预览会话。
- 在右侧面板查看画面，并执行点击、滑动、长按、按键和文本输入。
- 获取设备截图。
- 构建 Stage 项目，安装 HAP，并启动指定 Ability。
- 在工具完成后自动关联对应的预览会话。

## 前置条件

- 已安装并运行 DSH Desktop。
- 已安装 HDC，并将 `hdc` 加入 `PATH`，或设置 `HDC` 环境变量。
- HarmonyOS 设备已连接，并已允许 USB 调试。
- 从 GitHub 安装时，需要 Node.js 24 或更高版本，以执行插件的 `prepare` 构建脚本。
- 使用 `harmony_build_run` 时，项目必须是 Stage 项目，并能使用 Hvigor 构建。

检查设备连接：

```powershell
hdc list targets
```

## 安装

### 在 DSH Desktop 中安装

在 DSH 对话中发送以下请求：

```text
请安装并启用这个插件：
https://github.com/Jaxanyn/dsh-harmonyos
```

如果 DSH 要求确认 Git 构建脚本，请确认插件来源后允许执行。安装完成后重新加载或重启 DSH Desktop。

### 使用插件管理器安装

GitHub 安装规格如下：

```powershell
dsh plugin --profile web add github:Jaxanyn/dsh-harmonyos
```

Git 安装会读取仓库中的 `package.json` 和 `cordis.patch.yml`，并在需要时运行 `prepare` 构建插件。`desktop` profile 由 DSH Desktop 管理，桌面端优先使用应用内插件管理器或对话安装。

### 本地开发安装

```powershell
pnpm install
pnpm run build
dsh plugin --profile web add link:<path-to-repo>
```

修改代码后重新构建，并重新加载 DSH Desktop。

## 快速开始

安装完成并连接设备后，在 DSH 对话中发送：

```text
列出当前连接的鸿蒙设备。
```

确认设备序列号后发送：

```text
启动设备 <deviceId> 的 HarmonyOS 实时预览。
```

执行 `harmony_preview_start` 后，插件会在右侧打开预览面板。面板支持查看画面、刷新、截图、旋转视图、返回、主页、电源和文本输入。

## 工具

| 工具 | 用途 | 主要参数 |
| --- | --- | --- |
| `harmony_devices` | 列出 HDC 设备 | 无 |
| `harmony_preview_start` | 启动实时预览 | `deviceId` 可选 |
| `harmony_preview_stop` | 停止预览会话 | `sessionId` 必填 |
| `harmony_preview_info` | 查看活动会话 | 无 |
| `harmony_screenshot` | 获取设备截图 | `deviceId` 可选 |
| `harmony_interact` | 操作设备 | `deviceId`、`action` 必填 |
| `harmony_build_run` | 构建、安装并启动应用 | 项目路径、设备和构建标识必填 |

`harmony_interact` 支持以下操作：

```text
tap、swipe、long_press、button、type
```

`harmony_build_run` 需要显式提供以下参数：

```text
projectPath、deviceId、bundleName、abilityName、module、product、target
```

插件不会猜测包名、Ability 或构建目标。构建成功后才会安装 HAP 并启动指定 Ability。

## 常用请求

```text
列出当前连接的鸿蒙设备。
启动设备 <deviceId> 的实时预览。
截取当前鸿蒙设备屏幕。
点击当前设备画面上的按钮。
返回桌面并刷新预览。
停止当前 HarmonyOS 预览会话。
```

设备序列号应以 `harmony_devices` 的实际结果为准。构建运行时，还需要提供项目路径、包名、Ability、模块、产品和 target。

## 开发与验证

项目使用 Node.js 24 和 pnpm：

```powershell
pnpm install
pnpm run typecheck
pnpm run build
pnpm test
```

连接真机后运行设备测试：

```powershell
$env:HARMONY_DEVICE="<deviceId>"
pnpm test:device
```

构建产物位于 `lib/`。发布包只包含运行所需的 `lib/`、补丁文件、README 和许可证文件。

## 故障排查

### 找不到设备

运行 `hdc list targets`。如果没有设备，检查 USB 调试授权、HDC 路径和设备连接状态。

### 插件没有出现在 DSH 中

确认安装目标是当前使用的 DSH profile，确认 Git 构建脚本已完成，并重新加载或重启 DSH Desktop。桌面端 profile 由 DSH Desktop 管理，不要把 CLI 的 `--profile web` 结果误认为桌面端已加载。

### 右侧面板没有显示

先发送「列出当前连接的鸿蒙设备」，再发送启动预览请求。确认工具返回了 `sessionId`，然后重新加载 DSH Desktop。浏览器端只访问 DSH 提供的插件路由，不直接访问 HDC。

### 预览没有画面

确认设备在线，并重新执行 `harmony_preview_info` 或 `harmony_preview_start`。预览会话使用短期访问令牌，过期后刷新或重新启动会话即可。

### 构建运行失败

确认 `projectPath` 指向包含 `build-profile.json5` 的 Stage 项目，并核对 `module`、`product`、`target`、`bundleName` 和 `abilityName` 是否与项目配置一致。

## 许可证

[MIT](LICENSE)
