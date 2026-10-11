# 角色卡库

把下载的角色卡放在这里，在设置面板里点「刷新角色库」即可选择。

- `.json`：角色设定，支持 SillyTavern / Chub 常见的 `chara_card_v2` 格式（`data.name`、`description`、`personality`、`scenario`、`first_mes`、`mes_example`、`system_prompt` 等字段）
- `.png`：同名图片在「对话模拟」模式下作为背景
- 同名的 `xxx.json` + `xxx.png` 会合并成一个选项；只有其中一个也能识别
- 文件名里的 `main_` 前缀、`_spec_v2` 后缀和哈希串会自动去掉作为显示名

目前只读取 JSON 文件中的设定，**不会**解析 PNG 内嵌的角色卡元数据。

示例卡 `main_vera-volkova-tokyo-mafia-...` 仅作演示。
