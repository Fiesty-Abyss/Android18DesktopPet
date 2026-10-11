# 插件

插件让桌宠在不改代码的情况下多一些“生活感”：按时段打招呼、定时提醒、长时间不说话时主动搭话、快捷命令，以及给系统提示词追加设定。

## 安全模型

插件是**纯声明式**的：每个插件只有一个 `plugin.json`，程序只读取其中的数据，**不会执行插件里的任何代码**。
因此插件不能读写文件、联网、访问 API Key 或聊天记录，能做的事情只有下面列出的几种。

## 目录结构

```text
plugins/
  daily-greetings/
    plugin.json
  health-reminders/
    plugin.json
  my-plugin/          ← 新建一个文件夹即可
    plugin.json
```

- 以 `.` 或 `_` 开头的文件夹会被忽略，可以用来临时停用。
- 修改后在 设置 → 插件 → 「重新加载」，无需重启。
- 每个插件可以在设置里单独启用 / 停用，状态保存在本机配置中。

## plugin.json 格式

```jsonc
{
  "manifestVersion": 1,            // 必填，目前为 1
  "id": "my-plugin",               // 必填，小写字母 / 数字 / - / _，全局唯一
  "name": "我的插件",               // 必填，显示名
  "version": "1.0.0",              // 必填
  "description": "做什么用的",
  "author": "你的名字",
  "enabledByDefault": true,        // 第一次发现时是否启用，默认 true

  // 启动时按小时段打招呼（取第一个匹配的插件）。hours 为 [开始, 结束)，支持跨午夜如 [23, 5]
  "greetings": [
    { "hours": [5, 11], "texts": ["早。", "{weekday}，早上好。"] }
  ],

  // 定时提醒：every = 每隔 N 分钟（可选 activeHours 限定时段）；at = 每天固定时间（可选 weekdays，0 = 周日）
  "reminders": [
    { "every": 45, "activeHours": [9, 23], "text": ["喝水。"] },
    { "at": "23:30", "weekdays": [0, 1, 2, 3, 4], "text": "该睡了。" }
  ],

  // N 分钟没有聊天后说一句，之后每隔 N 分钟最多再说一次；用户一说话就重新计时
  "idle": { "afterMinutes": 30, "texts": ["在忙什么？"] },

  // 快捷命令：聊天框输入完全匹配 trigger 时直接回复，不发给模型、不写进聊天记录
  "commands": [
    { "trigger": "/time", "reply": "现在是 {time}。", "description": "报时" }
  ],

  // 追加到系统提示词末尾，影响模型回复（最多 2000 字）
  "systemPrompt": "用户的昵称是阿深。"
}
```

`text` / `texts` / `reply` 可以是字符串，也可以是字符串数组（随机挑一条）。单条文本最多 500 字，每个列表最多 50 项，`plugin.json` 不超过 256 KB。

### 模板变量

| 变量 | 含义 | 示例 |
| --- | --- | --- |
| `{time}` | 当前时间 | `23:41` |
| `{date}` | 当前日期 | `2026-10-11` |
| `{weekday}` | 星期 | `星期日` |
| `{hour}` | 小时 | `23` |
| `{name}` | 当前角色名 | `人造人18号` |
| `{affinity}` | 当前好感度 | `12` |

### 内置命令

- `/help` 或 `/帮助`：列出所有已启用插件提供的命令。

## 行为细节

- 提醒、闲聊每 15 秒检查一次；刚启用的 `every` 提醒从启用时开始计时。
- 桌宠窗口可见时在气泡里说；收进托盘时改用系统通知。
- 校验失败的插件不会加载，原因显示在设置 → 插件列表下方。

## 示例插件

| 插件 | 默认 | 内容 |
| --- | --- | --- |
| [`daily-greetings`](daily-greetings/plugin.json) | 启用 | 按时段问候；`/time`、`/date` |
| [`health-reminders`](health-reminders/plugin.json) | 关闭 | 喝水 / 活动 / 睡觉提醒，长时间不说话时搭话；`/break` |
