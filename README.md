# dsh-harmonyos-plugin

DeepSeek Harness 的 HarmonyOS 插件。通过 HDC 连接设备，在对话中完成设备发现、实时预览、截图、交互，以及 Stage 项目的构建、安装和启动。

界面结构参考 [dsh-android](https://github.com/ZSeven-W/dsh-android)，工具结果显示在对话中，设备画面显示在右侧预览面板。

## 前置条件

- DSH Desktop 已安装并运行。
- HDC 已加入 `PATH`，或已设置 `HDC`。
- HarmonyOS 设备已连接，并已允许 USB 调试。
- GitHub 安装需要 Node.js 24+；构建运行需要 Hvigor 和 Stage 项目。

```powershell
hdc list targets
```

## 安装

### DSH Desktop

在 DSH 对话中发送：

```text
请安装并启用这个插件：
https://github.com/Jaxanyn/dsh-harmonyos
```

确认 Git 构建脚本后，重新加载或重启 DSH Desktop。

### 插件管理器

```powershell
dsh plugin --profile web add github:Jaxanyn/dsh-harmonyos
```

DSH Desktop 的 `desktop` profile 由应用管理，桌面端优先使用应用内插件管理器或对话安装。

### 本地开发

```powershell
pnpm install
pnpm run build
dsh plugin --profile web add link:<path-to-repo>
```

修改代码后重新构建并重新加载 DSH Desktop。

## 使用

1. 发送「列出当前连接的鸿蒙设备」，获取 `deviceId`。
2. 发送「启动设备 <deviceId> 的 HarmonyOS 实时预览」。
3. 预览启动后，右侧面板显示画面。
4. 在面板中刷新、截图、旋转视图，或执行返回、主页、电源和文本输入。
5. 构建应用时，提供项目路径、设备、包名、Ability、模块、产品和 target。

## 工具

| 工具 | 用途 | 参数 |
| --- | --- | --- |
| `harmony_devices` | 列出设备 | 无 |
| `harmony_preview_start` | 启动预览 | `deviceId` 可选 |
| `harmony_preview_stop` | 停止预览 | `sessionId` 必填 |
| `harmony_preview_info` | 查看会话 | 无 |
| `harmony_screenshot` | 获取截图 | `deviceId` 可选 |
| `harmony_interact` | 操作设备 | `deviceId`、`action` 必填 |
| `harmony_build_run` | 构建并启动应用 | 项目和构建标识必填 |

`harmony_interact` 支持 `tap`、`swipe`、`long_press`、`button`、`type`。

`harmony_build_run` 必须提供：

`projectPath`、`deviceId`、`bundleName`、`abilityName`、`module`、`product`、`target`。

插件不会猜测包名、Ability 或构建目标。构建成功后才会安装 HAP 并启动 Ability。

## 开发与验证

```powershell
pnpm install
pnpm run typecheck
pnpm run build
pnpm test
```

真机测试：

```powershell
$env:HARMONY_DEVICE="<deviceId>"
pnpm test:device
```

## 故障排查

- **找不到设备**：运行 `hdc list targets`，检查 USB 调试授权、HDC 路径和设备状态。
- **插件没有加载**：确认安装到了当前 profile，构建脚本已完成，并重新加载或重启 DSH Desktop。CLI 的 `--profile web` 不等于桌面端已加载。
- **右侧面板没有显示**：确认 `harmony_preview_start` 返回了 `sessionId`，然后重新启动预览。
- **构建失败**：确认 `projectPath` 是 Stage 项目，并核对 `module`、`product`、`target`、`bundleName` 和 `abilityName`。

## 许可证

[MIT](LICENSE)
