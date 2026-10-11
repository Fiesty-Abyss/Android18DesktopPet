# 更新日志

## 0.3.0

### 新功能

- **声明式插件系统**：`plugins/<id>/plugin.json` 支持按时段问候、定时提醒（every / at）、闲聊、快捷命令和追加系统提示词；插件只含数据、不执行代码。设置面板可逐个启用 / 停用、重新加载，`/help` 列出命令，窗口隐藏时提醒走系统通知
- 附带示例插件 `daily-greetings`（默认启用）与 `health-reminders`（默认关闭），以及 [插件开发文档](plugins/README.md)
- **SillyTavern PNG 角色卡**：读取 PNG 中 `tEXt` / `iTXt` / `zTXt` 的 `ccv3`（V3）与 `chara`（V2）角色卡，只有 PNG 的卡也能直接使用
- 设置面板新增「导入角色卡…」（多选 JSON / PNG）与「导出为 PNG 角色卡」（同时写入 V2 + V3，导回时无损）

### 改进

- 升级到 Electron 44、electron-builder 26.17、node-llama-cpp 3.22，`npm audit` 告警 30 → 12（剩余均不在运行时路径上）
- 安装包只带目标平台的 node-llama-cpp 二进制，去掉 llama.cpp 源码包；新增 `npm run dist:lite`（不含 CUDA）。Linux 解包体积 1004 MB → 937 MB / 399 MB（lite）
- Windows 绿色版脚本只复制生产依赖，不再把本机模型权重和聊天记录打进去

### 其它

- 采用 MIT 许可证（模型与角色卡素材的许可证各自独立）
- 引入 vitest 单元测试（`npm test`），覆盖 PNG 角色卡读写与插件校验 / 调度
- GitHub Actions：CI（Ubuntu + Windows 上 typecheck / 测试 / 构建）与 Release 工作流（自动构建 Windows 安装包）
- Issue / PR 模板

## 0.2.0

### 新功能

- 本地 GGUF 推理移到独立的 `utilityProcess` 子进程，推理时界面不卡，子进程崩溃不会带走桌宠本体
- 本地模型支持自定义「额外模型目录」，扫描两层子目录，替代写死的 `E:\mod`
- 系统托盘：显示 / 隐藏、打开设置、始终置顶、重置窗口位置、退出
- 记住窗口位置；单实例运行
- 聊天历史导出为 Markdown / JSON；角色库、模型、聊天记录目录一键打开
- 应用图标与托盘图标

### 修复

- 右键立绘在 Windows / Linux 上弹出系统菜单，而不是桌宠设置
- 未设置 API Key 的提示被当成角色回复写进记忆；请求失败时仍然加减好感度
- 每日聊天日志按 UTC 日期切分
- 导入角色卡的长开场白撑满气泡，挡住立绘和工具栏
- 生成剧情失败时没有提示；云端接口报错只显示笼统信息
- 额外模型目录输入框高度异常

### 其它

- 主进程 / preload / 渲染进程类型统一到 `shared/types.ts`
- 新增 `npm run typecheck`，electron-builder 增加图标和 Linux AppImage 配置
- 补充本地模型推荐与各目录说明文档、真实运行截图

## 0.1.0

- 首个版本：Electron 透明桌宠、云端 API / 本地 GGUF、角色卡、好感度、对话模拟、聊天记录隔离
