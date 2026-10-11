# 本地模型（GGUF）

把 `.gguf` 模型文件放在这个目录里，桌宠设置 →「推理来源：本地 GGUF」→「刷新」即可看到。
模型权重体积很大，已在 `.gitignore` 中忽略，**不要提交到仓库**。

也可以不复制文件：在设置面板的「额外模型目录」里填上模型所在的文件夹（每行一个），
保存后会一并扫描（支持两层子目录）。Windows 下默认额外扫描 `E:\mod`，可以自行删改。

## 实测可用 / 推荐

作者日常使用的两个 8B 模型，均为 Q4_K_M 量化（约 4.9 GB）：

| 模型 | 特点 | 下载 |
| --- | --- | --- |
| `L3-8B-Stheno-v3.2-Q4_K_M.gguf` | Llama 3 8B 角色扮演微调，口吻自然，适合桌宠日常 / 剧情对话 | GGUF：[bartowski/L3-8B-Stheno-v3.2-GGUF](https://huggingface.co/bartowski/L3-8B-Stheno-v3.2-GGUF) · 原模型：[Sao10K/L3-8B-Stheno-v3.2](https://huggingface.co/Sao10K/L3-8B-Stheno-v3.2)（CC BY-NC 4.0） |
| `dolphin-2.9.4-llama3.1-8b-Q4_K_M.gguf` | Llama 3.1 8B 通用指令微调，限制少，上下文长 | GGUF：[dphn/dolphin-2.9.4-llama3.1-8b-gguf](https://huggingface.co/dphn/dolphin-2.9.4-llama3.1-8b-gguf) 或 [bartowski/dolphin-2.9.4-llama3.1-8b-GGUF](https://huggingface.co/bartowski/dolphin-2.9.4-llama3.1-8b-GGUF) · 原模型：[dphn/dolphin-2.9.4-llama3.1-8b](https://huggingface.co/dphn/dolphin-2.9.4-llama3.1-8b)（Llama 3.1 License） |

> 不同上传者的文件名大小写可能不同（例如 `...-q4_k_m.gguf`），不影响使用。
> 模型许可证以各自 Hugging Face 页面为准。

在 Hugging Face 页面的 **Files and versions** 中下载对应的 `Q4_K_M` 文件即可；
国内网络可以使用镜像站（把域名换成 `hf-mirror.com`）。

## 推荐设置（8B Q4_K_M）

| 显存 | 生成引擎 | 显存优化 | 上下文 | KV 缓存 |
| --- | --- | --- | --- | --- |
| ≥ 8 GB（NVIDIA） | CUDA GPU | 自动适配 / 8GB 平衡 | 4096 | F16 |
| 6 GB 左右 | CUDA / Vulkan | 8GB 平衡 | 4096 | Q8_0 |
| 无独显 | CPU | 低显存/CPU层 | 2048 | Q8_0 |

- 第一次发送消息时才会加载模型，会慢几秒到几十秒，之后会复用。
- 设置里的「卸载本地模型」可以随时释放内存 / 显存。
- 本地推理在独立的子进程里运行；如果因为内存不足等原因崩溃，桌宠会提示原因而不会整个退出。

### 关于纯 CPU 运行

Electron（Chromium）的内存分配器限制单次分配不能超过 2 GiB（见 [electron/electron#44291](https://github.com/electron/electron/issues/44291)）。
纯 CPU 跑较大的模型时，llama.cpp 可能一次申请超过这个大小的缓冲区，推理子进程会被直接结束。
实测 1.5B 级别的小模型在纯 CPU 下正常；8B 模型建议开启 CUDA / Vulkan 并让大部分层放到显存里。

## 截图里用的模型

README 中的本地对话截图是在没有显卡的 Linux 环境里，用
[Qwen2.5-1.5B-Instruct-GGUF](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF)（`qwen2.5-1.5b-instruct-q4_k_m.gguf`）纯 CPU 跑的，
只用来演示流程。小模型回复质量一般，日常使用建议换成上面的 8B 模型。
