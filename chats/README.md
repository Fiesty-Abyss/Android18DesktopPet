# 聊天记录

运行时自动生成，已在 `.gitignore` 中忽略。

每个「交互模式 + 角色卡 + 模型」组合一个子目录，例如
`pet_builtin_android18_local_L3-8B-Stheno-v3.2-Q4_K_M.gguf/`：

- `current-chat.json`：当前会话快照（最多保留最近 80 条）
- `YYYY-MM-DD.jsonl`：按本地日期追加的逐条日志

在聊天历史面板点「导出」可以把当前会话保存为 Markdown 或 JSON。
