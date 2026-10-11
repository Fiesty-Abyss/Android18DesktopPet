# Android 18 Desktop Pet · 人造人18号桌宠

> **当前版本 0.2.0**：Electron 透明桌宠 + AI 对话。支持云端 API（DeepSeek 等 OpenAI 兼容接口）与本地 GGUF 模型（`node-llama-cpp`，独立子进程推理），自带角色卡库、好感度、对话模拟、聊天记录隔离与导出、系统托盘。

![Electron](https://img.shields.io/badge/Electron-39-47848F?logo=electron&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/electron--vite-4-646CFF?logo=vite&logoColor=white)
![node-llama-cpp](https://img.shields.io/badge/node--llama--cpp-3.18-111111)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-lightgrey)

- [快速开始](#快速开始) · [本地模型](#本地模型) · [打包](#打包) · [目录结构](#目录结构) · [配置](#配置) · [已知限制](#已知限制) · [更新日志](CHANGELOG.md)
- [本地模型说明](models/README.md) · [角色卡库说明](character-cards/README.md) · [聊天记录格式](chats/README.md)

## 1. 桌宠与日常对话

[![桌宠日常对话](docs/screenshots/01-pet-chat.png)](docs/screenshots/01-pet-chat.png)

### 功能说明

无边框透明窗口，立绘常驻桌面并带待机 / 思考 / 开心 / 出错四种动画状态。下方输入框直接聊天，回复显示在头顶气泡里；拖动立绘即可移动窗口，位置会被记住。工具栏按钮依次为：历史（H）、缩小 / 放大、对话模拟（M）、设置（S）、隐藏输入区、清空记忆（C）、收起到托盘、退出。

### 设计思路

渲染进程只负责界面，所有模型调用、文件读写都在主进程里，通过 `contextBridge` 暴露的 `window.pet` 调用；API Key 不会回传到渲染进程，只告诉它“是否已设置”。回复会做后处理：去掉“角色名：”前缀、“作为 AI…”之类出戏的话、重复的句子和超长尾巴。请求失败时会撤回这句并把原文放回输入框，好感度也只在成功拿到回复后结算。

### 实现映射

| 层次 | 实现 |
| --- | --- |
| 窗口 / 托盘 | [`electron/main.ts`](electron/main.ts) · `createWindow`、`createTray`、`rememberWindowPosition` |
| 对话 | [`electron/main.ts`](electron/main.ts) · `askAssistant` → `askCloudApi` / `askLocalModel`，`postProcessAnswer` |
| 界面 | [`src/main.ts`](src/main.ts) · `ask`、`say`、`setMood`；样式 [`src/style.css`](src/style.css) |
| IPC | [`electron/preload.ts`](electron/preload.ts)，类型 [`shared/types.ts`](shared/types.ts) |

## 2. 聊天历史与导出

[![聊天历史面板](docs/screenshots/02-history.png)](docs/screenshots/02-history.png)

### 功能说明

历史面板可以逐条删除、清空、导出（Markdown / JSON），或直接打开聊天记录目录。聊天记录按「交互模式 + 角色卡 + 模型」分别保存，换角色或换模型不会串台。

### 设计思路

记忆同时存两份：`electron-store` 里保存最近 80 条用于上下文，`chats/` 目录下写快照和按本地日期切分的 JSONL 日志，方便备份或拿去别处用。

### 实现映射

| 层次 | 实现 |
| --- | --- |
| 记忆隔离 | `chatMemoryKey`、`currentMessages`、`setCurrentMessages` |
| 落盘 / 导出 | `writeChatSnapshot`、`exportCurrentChat`、`chatToMarkdown` |
| 文件格式 | [`chats/README.md`](chats/README.md) |

## 3. 设置：云端 API

[![云端 API 设置](docs/screenshots/03-settings-api.png)](docs/screenshots/03-settings-api.png)

### 功能说明

右键立绘、点工具栏 S 或托盘菜单都能打开设置。云端模式填 API Key、Base URL 和模型名即可，内置 DeepSeek 常用模型，也可以自定义；任何 OpenAI Chat Completions 兼容接口都能用。同一面板里还能调回复长度、温度、整体缩放、窗口置顶和更换立绘图片。

### 设计思路

Key 只保存在本机配置里，输入框留空表示不修改。接口报错时按状态码给出中文提示（401 Key 无效、402 余额不足、429 限流等），并设置 90 秒超时。

### 实现映射

| 层次 | 实现 |
| --- | --- |
| 配置读写 | `getConfig`、`saveConfig`、`toRendererConfig`（去掉明文 Key） |
| 请求 | `askCloudApi`、`cloudErrorHint` |
| 立绘图片 | `selectModelImage`、`getCustomModelImage` |

## 4. 设置：本地 GGUF

[![本地 GGUF 设置](docs/screenshots/04-settings-local.png)](docs/screenshots/04-settings-local.png)

### 功能说明

切到「本地 GGUF」后，自动扫描 `models/` 和「额外模型目录」里的 `.gguf` 文件；可以导入模型、打开目录、选择 CUDA / Vulkan / CPU，调整显存策略、上下文、批处理、线程数、KV 缓存类型、Flash Attention、mmap 等。推荐模型见 [本地模型](#本地模型)。

### 设计思路

`node-llama-cpp` 在独立的 `utilityProcess` 子进程里加载和推理：推理期间界面不卡；子进程崩溃（显存不足、Electron 内存分配上限等）时桌宠本体不受影响，并提示原因。参数不变时复用已加载的模型，改了参数会自动重新加载。

### 实现映射

| 层次 | 实现 |
| --- | --- |
| 推理子进程 | [`electron/llm-worker.ts`](electron/llm-worker.ts) · `ensureRuntime`、`prompt` |
| 主进程客户端 | [`electron/llm-client.ts`](electron/llm-client.ts) · `LocalLlmClient`；协议 [`shared/llm-protocol.ts`](shared/llm-protocol.ts) |
| 模型扫描 | `scanLocalModels`、`scanDirForModels`、`importLocalModel` |

## 5. 好感度与开发者模式

[![开发者模式](docs/screenshots/05-dev-mode.png)](docs/screenshots/05-dev-mode.png)

### 功能说明

好感度范围 -100 ~ 100，分为厌恶 / 疏离 / 普通 / 熟悉 / 亲近五个阶段，会写进系统提示词影响语气。夸她、道谢会加分，骂她会扣分。单击立绘查看当前好感度，**快速连点四下**进入开发者模式，可以直接拖动调整。

### 实现映射

| 层次 | 实现 |
| --- | --- |
| 阶段与提示词 | `affinityStage`、`buildSystemPrompt` |
| 加减分 | [`src/main.ts`](src/main.ts) · `affinityDeltaFrom`、`setAffinity` |

## 6. 角色卡库

[![角色卡选择](docs/screenshots/06-character-cards.png)](docs/screenshots/06-character-cards.png)

[![导入角色卡的长开场白](docs/screenshots/07-long-greeting.png)](docs/screenshots/07-long-greeting.png)

### 功能说明

内置「人造人18号」角色卡（[`characters/android18.card.json`](characters/android18.card.json)），也可以在设置里手写 JSON，或把下载的角色卡放进 `character-cards/` 后刷新选择。支持 SillyTavern / Chub 常见的 `chara_card_v2` JSON；同名 PNG 会在对话模拟模式中作为背景。导入卡的开场白很长时，气泡会限制高度并可滚动。

### 实现映射

| 层次 | 实现 |
| --- | --- |
| 扫描 / 选择 | `scanCharacterCards`、`selectCharacterCard` |
| 格式转换 | `normalizeImportedCharacterCard`（清理 HTML、替换 `{{char}}` / `{{user}}`） |
| 说明 | [`character-cards/README.md`](character-cards/README.md) |

## 7. 对话模拟

[![对话模拟](docs/screenshots/08-simulation.png)](docs/screenshots/08-simulation.png)

### 功能说明

点工具栏 M 进入对话模拟：上方写剧情（或让模型「生成剧情」），下方逐句推进。每一句都能改角色、改内容、删除；也能手动插入用户句 / 角色句、撤回末句，适合写一段完整的剧情对话。

### 设计思路

对话模拟和桌宠模式共用同一套记忆与模型调用，只是系统提示词不同：模拟模式会把用户输入当作剧情中的对白、动作或旁白，允许更长的回复。

### 实现映射

| 层次 | 实现 |
| --- | --- |
| 提示词 | `buildSystemPrompt`（`interactionMode === 'simulation'` 分支） |
| 界面 | [`src/main.ts`](src/main.ts) · `renderSimulation`、`generateStory` 相关事件 |
| 背景 | `getCharacterBackground`、`.sim-modal.has-bg` |

> 截图说明：以上截图均为在 Linux（Xvfb + xfce）上 `npm run dev` 实际运行截取。本地对话使用 Qwen2.5-1.5B-Instruct Q4_K_M 纯 CPU 推理，仅用于演示流程，回复质量不代表推荐的 8B 模型。

## 快速开始

环境要求：

- Node.js 20.19+ 或 22.12+（Vite 7 的要求）
- Windows 10/11（主要使用平台）；Linux 也可以开发运行
- 使用本地模型时：NVIDIA 显卡（CUDA）或支持 Vulkan 的显卡效果最好

```bash
git clone https://github.com/Fiesty-Abyss/Android18DesktopPet.git
cd Android18DesktopPet
npm install
cp .env.example .env   # Windows: copy .env.example .env，可选
npm run dev
```

启动后右键立绘打开设置，填 API Key 或切到本地 GGUF 即可开始聊天。

常用脚本：

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发模式（热更新） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run build` | 类型检查 + 构建到 `out/` |
| `npm run dist` | 构建 Windows 绿色版（需在 Windows 上执行） |
| `npm run dist:builder` | 用 electron-builder 打包（Windows：portable + NSIS；Linux：AppImage） |

## 本地模型

作者实测使用、推荐的两个模型（均为 Q4_K_M，约 4.9 GB）：

| 模型文件 | 下载 |
| --- | --- |
| `L3-8B-Stheno-v3.2-Q4_K_M.gguf` | [bartowski/L3-8B-Stheno-v3.2-GGUF](https://huggingface.co/bartowski/L3-8B-Stheno-v3.2-GGUF) |
| `dolphin-2.9.4-llama3.1-8b-Q4_K_M.gguf` | [dphn/dolphin-2.9.4-llama3.1-8b-gguf](https://huggingface.co/dphn/dolphin-2.9.4-llama3.1-8b-gguf) |

1. 下载 `.gguf` 文件，放进项目的 `models/`，或者放在任意文件夹后在设置里把该文件夹加入「额外模型目录」。
2. 设置 → 推理来源选「本地 GGUF」→ 选择模型 → 生成引擎选 CUDA（N 卡）或 Vulkan → 保存。
3. 发第一句话时加载模型，稍等即可。

推荐参数、许可证和纯 CPU 运行的注意事项见 [models/README.md](models/README.md)。模型文件已被 `.gitignore` 忽略，不要提交到仓库。

## 打包

```bash
npm run dist          # Windows 绿色版 → dist/Android18DesktopPet/Android18DesktopPet.exe
npm run dist:builder  # electron-builder → dist/
```

打包后 `models/`、`character-cards/`、`chats/` 等目录位于 exe 同级，方便直接放模型和角色卡。由于包含 `node-llama-cpp` 的各平台原生二进制，安装包体积较大。

## 目录结构

```text
electron/
  main.ts           主进程：窗口、托盘、配置、云端请求、角色卡、聊天记录
  llm-worker.ts     本地 GGUF 推理子进程（utilityProcess）
  llm-client.ts     主进程侧的推理子进程客户端
  preload.ts        contextBridge，暴露 window.pet
shared/             三端共用的类型与消息协议
src/                渲染进程界面（原生 TypeScript + CSS）
assets/             立绘、应用图标、托盘图标
characters/         内置默认角色卡
character-cards/    用户角色卡库（json / png）
models/             本地 GGUF 模型（不入库）
chats/              运行时聊天记录（不入库）
cache/  plugins/    预留目录
docs/screenshots/   README 截图
scripts/            Windows 绿色版打包脚本
```

## 配置

复制 `.env.example` 为 `.env`（可选，也可以全部在设置面板里填）：

```env
DEEPSEEK_API_KEY=your_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
```

其余设置保存在系统用户目录下的 `electron-store` 配置文件中（Windows：`%APPDATA%\android-18-desktop-pet\config.json`）。**不要**把真实 `.env` 或 API Key 提交到 Git。

## 技术栈

| 部分 | 技术 |
| --- | --- |
| 桌面壳 | Electron 39 + electron-vite 4 |
| 语言 | TypeScript（主进程 / preload / 渲染进程共用类型） |
| 界面 | 原生 DOM + CSS，无前端框架 |
| 本地推理 | node-llama-cpp 3（llama.cpp），运行在 utilityProcess |
| 云端推理 | OpenAI Chat Completions 兼容接口（默认 DeepSeek） |
| 配置持久化 | electron-store |
| 打包 | electron-builder / 自带 Windows 绿色版脚本 |

## 已知限制

- 纯 CPU 运行较大的模型时，可能触发 Electron 单次 2 GiB 内存分配上限导致推理子进程退出（桌宠本体不受影响），建议开启 GPU，详见 [models/README.md](models/README.md#关于纯-cpu-运行)。
- 角色卡只读取 JSON，不解析 PNG 内嵌的角色卡元数据。
- `plugins/` 目前只是预留目录。
- Linux 下透明窗口和托盘图标依赖桌面环境的合成器 / 托盘支持。

## 说明

个人兴趣项目。立绘与示例角色卡为 AI 生成素材；第三方模型请遵守各自的许可证。
