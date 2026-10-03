# dsh-harmonyos-plugin

DeepSeek Harness 的 HarmonyOS 插件。插件通过 HDC 连接鸿蒙设备，在对话中完成设备发现、实时预览、截图、交互，以及 Stage 项目的构建、安装和启动。

## 功能

- 发现已连接的 HarmonyOS 设备。
- 启动和停止设备实时预览，查看当前屏幕画面。
- 截图、点击、滑动、长按、按键和文本输入。
- 构建 Stage 项目，安装 HAP，并启动指定 Ability。
- 在 DSH 对话和右侧预览面板中操作设备。

## 前置条件

- 已安装并运行 DSH Desktop。
- 已安装 HDC，并将 `hdc` 加入 `PATH`。
- HarmonyOS 设备已连接，并已允许 USB 调试。
- 使用 `harmony_build_run` 时，项目必须是 Stage 项目，并提供完整的构建参数。

检查设备连接：

```powershell
hdc list targets
```

## 安装

### 从 npm 安装

发布 npm 后，在 DSH Web 配置中执行：

```powershell
dsh plugin --profile web add dsh-harmonyos-plugin@latest
```

安装完成后重启 DSH Desktop。插件加载后，可以直接在对话中调用 HarmonyOS 工具。

### 本地开发安装

```powershell
pnpm install
pnpm run build
dsh plugin --profile web add link:F:\HongMengHangtu\dsh-HarmonyOS -w
```

修改代码并重新构建后，重启 DSH Desktop 以加载新的插件产物。

## 使用

可以在 DSH 对话中直接提出以下请求：

```text
列出当前连接的鸿蒙设备。
启动设备 <deviceId> 的实时预览。
截取当前鸿蒙设备屏幕。
点击设备屏幕坐标 (300, 500)。
停止预览 <sessionId>。
```

执行 `harmony_preview_start` 后，插件会在右侧显示实时预览面板。面板支持选择设备、查看画面、发送返回键、主页键和电源键，以及输入文本。

## 工具

| 工具 | 用途 | 主要参数 |
| --- | --- | --- |
| `harmony_devices` | 列出 HDC 设备 | 无 |
| `harmony_preview_start` | 启动实时预览 | `deviceId` 可选 |
| `harmony_preview_stop` | 停止实时预览 | `sessionId` 必填 |
| `harmony_preview_info` | 查看活动会话 | 无 |
| `harmony_screenshot` | 获取设备截图 | `deviceId` 可选 |
| `harmony_interact` | 操作设备 | `deviceId`、`action` 必填 |
| `harmony_build_run` | 构建、安装并启动应用 | 项目路径、设备、包名、Ability 和构建参数 |

`harmony_interact` 支持以下操作：

```text
tap、swipe、long_press、button、type
```

`harmony_build_run` 需要显式提供以下参数：

```text
projectPath、deviceId、bundleName、abilityName、module、product、target
```

插件不会猜测项目标识。构建成功后，插件才会安装 HAP 并启动指定 Ability。

## 开发与验证

项目要求 Node.js 24 或更高版本，并使用 pnpm：

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

## 常见问题

### 找不到设备

运行 `hdc list targets`。如果设备未显示，请检查 USB 调试授权、HDC 路径和设备连接状态。

### 右侧面板没有更新

重新执行 `pnpm run build`，然后重启 DSH Desktop。确认插件使用的是当前项目路径或最新 npm 版本。

### 构建运行失败

确认 `projectPath` 指向包含 `build-profile.json5` 的 Stage 项目，并检查 `module`、`product`、`target`、`bundleName` 和 `abilityName` 是否与项目配置一致。

## 许可证

[MIT](LICENSE)
