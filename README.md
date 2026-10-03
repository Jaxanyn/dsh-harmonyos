# dsh-harmonyos

DeepSeek Harness 纯血鸿蒙插件：在对话中构建、运行鸿蒙应用，实时查看设备画面并与设备交互，完全通过 HDC 驱动。

当前状态：已完成 DSH 插件、HDC 设备发现、真机截图、预览会话、设备交互、构建安装启动，以及右侧栏实时预览面板。

当前工具：`harmony_devices`、`harmony_preview_start`、`harmony_preview_stop`、`harmony_preview_info`、`harmony_screenshot`、`harmony_interact`、`harmony_build_run`。

## GUI

在 DSH 对话输入区打开 `HarmonyOS preview`。面板会显示在右侧栏，可选择 HDC 设备、启动/停止预览、查看实时画面、发送返回/主页/电源按键和文本输入。

## 构建运行

`harmony_build_run` 要求显式提供 Stage 项目、设备、bundle、ability、module、product 和 target；构建成功后才会安装 HAP 并启动 ability。

## 开发

```powershell
pnpm install
pnpm run typecheck
pnpm run build
pnpm test
```
