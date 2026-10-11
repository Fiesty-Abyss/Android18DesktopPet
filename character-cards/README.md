# 角色卡库

把下载的角色卡放在这里，在设置面板里点「刷新角色库」即可选择；也可以用设置里的「导入角色卡…」自动复制进来。

- `.json`：角色设定，支持 SillyTavern / Chub 常见的 `chara_card_v2` / `chara_card_v3` 格式（`data.name`、`description`、`personality`、`scenario`、`first_mes`、`mes_example`、`system_prompt` 等字段）
- `.png`：SillyTavern / Chub 的 PNG 角色卡，读取内嵌的 `ccv3`（V3，优先）或 `chara`（V2）文本块；同时在「对话模拟」模式下作为背景。没有内嵌设定的普通 PNG 只作背景
- 同名的 `xxx.json` + `xxx.png` 会合并成一个选项，设定以 JSON 为准；只有其中一个也能识别
- 文件名里的 `main_` 前缀、`_spec_v2` 后缀和哈希串会自动去掉作为显示名

设置里的「导出为 PNG 角色卡」会把当前角色写成同时带 V2 / V3 块的 PNG，可直接导入 SillyTavern。

示例卡 `main_vera-volkova-tokyo-mafia-...` 仅作演示。
