# Android 18 Desktop Pet

Electron 透明桌宠 + AI 对话小工具。支持云端 API（如 DeepSeek）与本地 GGUF 模型（`node-llama-cpp`），可切换桌宠模式 / 对话模拟模式，自带角色卡、好感度、聊天记录隔离等。

## 功能概览

- 云端 API / 本地 GGUF 模型切换
- 角色卡手写编辑，或从 `character-cards/` 读取（JSON + 同名 PNG）
- 桌宠模式与对话模拟模式
- 聊天记录按「角色卡 + 交互模式 + 模型」隔离，可浏览 / 删除 / 清空
- 好感度（支持负值；开发者模式可手动调）
- 桌宠缩放与自定义立绘

## 环境要求

- Node.js 18+（建议 LTS）
- Windows（当前打包脚本面向 Win）
- 使用本地模型时：把 `.gguf` 放到 `models/`，或配置额外扫描目录

## 快速开始

```bash
cd Android18DesktopPet
npm install
cp .env.example .env   # Windows: copy .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY（也可用应用内右键设置）
npm run dev
```

开发启动后无需依赖打包目录。API Key、本地模型、角色卡、图片等可在桌宠右键菜单里配置。

## 打包 EXE

```bash
npm run dist
```

产物大致在：

```text
dist/Android18DesktopPet/Android18DesktopPet.exe
```

也可用 `npm run dist:builder`（electron-builder）。

## 目录说明

```text
electron/         主进程 / preload
src/              渲染进程 UI
assets/           默认立绘等资源
characters/       内置默认角色卡
character-cards/  用户下载的角色卡（json / png）
models/           放置 GGUF 本地模型（不入库）
chats/            运行时聊天记录（不入库）
cache/            本地缓存（不入库）
plugins/          预留插件目录
scripts/          打包脚本
```

### 角色卡

- 同名 `.json` + `.png` 在设置里合并为一个角色选项
- 仅有 json 或仅有 png 也会识别
- 桌宠模式主要用 JSON 设定
- 对话模拟模式会把同名 PNG 当背景；没有则透明背景

### 本地模型

- 扫描项目内 `models/` 下的 `.gguf`
- 若存在 `E:\mod`（Windows），也会扫描其中的 GGUF（可按本机习惯放模型）

## 配置

复制 `.env.example` → `.env`：

```env
DEEPSEEK_API_KEY=your_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

**不要**把真实 `.env` 或 API Key 提交到 Git。

## 技术栈

| 部分 | 技术 |
| --- | --- |
| 壳 | Electron + electron-vite |
| 语言 | TypeScript |
| 本地推理 | node-llama-cpp |
| 配置持久化 | electron-store |

## 说明

个人/学习向小项目。立绘与角色卡示例为 AI 生成素材。
