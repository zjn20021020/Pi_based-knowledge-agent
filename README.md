# 📚 Paper Knowledge Agent

> 基于 [Pi Agent](https://github.com/earendil-works/pi) 框架构建的学术论文库管家 —— 对话式管理多个研究主题的论文库，自动从 arXiv 抓取、按段落级语义检索。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D22.19-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Built on Pi](https://img.shields.io/badge/built%20on-Pi%20Agent-orange.svg)](https://github.com/earendil-works/pi)
[![LLM](https://img.shields.io/badge/LLM-DeepSeek%20%7C%20OpenAI-purple.svg)]()

一个跑在终端里的 **AI 论文库管家**，**基于 Pi Agent 框架**搭建。你只管说"我要研究 RAG"，它会替你建库、爬 arXiv、解析 PDF、切段索引，最后用语义检索把相关段落直接喂回给你。

---

## ✨ 特性

- 🏗️ **基于 Pi Agent 框架** —— 使用 `@earendil-works/pi-coding-agent` 的 `InteractiveMode` 和 `ModelRegistry`，享受 Pi 的富文本 TUI、会话管理、工具调度能力
- 🗂️ **多库分类管理** —— 每个研究主题一个库，自带描述与元数据
- 🤖 **智能路由** —— 下载时自动判断论文该进哪个库，检索时自动选择搜哪个库
- 📥 **arXiv 自动抓取** —— 关键词搜索 + 批量下载 PDF，内置限流策略
- 📑 **Layout-aware PDF 解析** —— Python 子进程调 [pdfminer.six](https://github.com/pdfminer/pdfminer.six)，按坐标识别**双栏排版**、过滤 arXiv 竖排水印 / 行号、合并行末断词，再按学术章节（Method、Experiments…）严格切分，检索结果带章节定位
- 🧬 **多 Embedding 后端** —— OpenAI 兼容协议，可指向 SiliconFlow / 阿里云灵积 / 智谱 / Voyage 等任意服务，401 / 超时优雅降级，空 chunk / 超长 chunk 自动跳过不会让索引崩
- 🔌 **OpenAI 兼容 LLM** —— 通过 Pi 的 ModelRegistry 接入任何 OpenAI 兼容 API：DeepSeek、OpenAI、Moonshot、本地模型
- 💾 **零外部服务** —— SQLite (sql.js) + JSON 向量存储，不用 Docker、不用 Redis
- 💬 **15 个自定义工具** —— 注入到 Pi Agent 作为 customTools，全程自然语言操作

---

## 📸 效果预览

启动后是 Pi 的富文本 TUI，对话流程大致如下：

```text
你: 我想做个 RAG 主题的论文库

[工具调用]
  🔧 List Collections...
  ✓ List Collections 完成

Agent: 当前没有任何论文库。我帮你新建一个，建议库名 `rag`，描述
       "RAG（检索增强生成）相关论文"。这样可以吗？

你: 可以，搜最近的 20 篇

[工具调用]
  🔧 Create Collection...
  🔧 Search arXiv...
  ✓ 找到 20 篇

Agent: 已创建库 `rag`，arXiv 上找到了：
       1. **Self-RAG: Self-Reflective Retrieval-Augmented Generation** (2310.11511)
       2. **HyDE: Hypothetical Document Embeddings** (2312.10997)
       ...
       要下载哪些？

你: 前 10 篇

[工具调用]
  🔧 Download to Collection...
  ⬇️ 下载 1/10... 5/10... 10/10
  🔧 Index Collection...
  📊 完成，共 840 个段落

你: RAG 的检索质量如何评估？

Agent: 根据库里的论文，主要从三个维度评估：

       ### [1] Self-RAG (库:`rag`, 章节:Method, ID:`2310.11511`)
       我们提出自省机制，从 Relevance、Coverage、Faithfulness 三方面打分...

       ### [2] HyDE (库:`rag`, 章节:Evaluation, ID:`2312.10997`)
       ...
```

---

## 🚀 快速开始

### 环境要求

- **Node.js** ≥ 22.19
- **Python** ≥ 3.8（用于 PDF layout 解析，子进程调用）
- LLM API key：推荐 [DeepSeek](https://platform.deepseek.com/)，便宜量大
- Embedding API key：推荐国内用 [SiliconFlow](https://siliconflow.cn/)（有免费额度，bge-large-en/zh-v1.5 都好用）

### 安装

```bash
git clone https://github.com/<your-username>/paper-agent.git
cd paper-agent
npm install
pip install -r requirements.txt   # 装 pdfminer.six（Python 端）
cp .env.example .env
# 编辑 .env，填 LLM key + Embedding key
npm run init   # 初始化 SQLite 数据库（只跑一次）
npm start
```

启动后直接对话即可。输入 `help` 看所有可用工具，`exit` 退出。

> **两个入口的区别**
>
> | 命令 | 入口 | 用途 |
> |---|---|---|
> | `npm start` | `src/main.ts` | **主入口**，使用 Pi Agent 框架，富文本 TUI |
> | `npm run start:simple` | `src/main-simple.ts` | 调试用，绕过 Pi 直接 OpenAI SDK，纯文本 readline |
>
> 默认用 `npm start`。`start:simple` 仅用于：(a) 排查 Pi 框架本身的问题；(b) 测试 OpenAI 兼容 API 是否能联通。

### .env 配置

```bash
# === LLM 推理（走 Pi 内置 deepseek provider）===
DEEPSEEK_API_KEY=sk-your-deepseek-key
# 兼容别名：main.ts 会 fallback 到 DEEPSEEK_API_KEY
OPENAI_API_KEY=sk-your-deepseek-key
LLM_API_KEY=sk-your-deepseek-key

DEFAULT_MODEL=deepseek-v4-pro      # 主推理模型
REVIEW_MODEL=deepseek-v4-pro

# === Embedding（独立的 OpenAI 兼容服务，推荐 SiliconFlow / 阿里云 / 智谱）===
EMBED_BASE_URL=https://api.siliconflow.cn/v1
EMBED_API_KEY=sk-your-siliconflow-key
EMBED_MODEL=BAAI/bge-large-en-v1.5
```

切换到真 OpenAI（国外网络）：

```bash
EMBED_BASE_URL=https://api.openai.com/v1
EMBED_API_KEY=sk-your-openai-key
EMBED_MODEL=text-embedding-3-small
```

不配 `EMBED_*` 时降级到 TF-IDF 离线模式，**仅作最后兜底**——TF-IDF 在 query / 文档跨调用时词表不一致，语义检索质量会打折，**强烈建议**接入一个真 embedding 服务。

---

## 🛠️ 可用工具

Agent 自带 15 个工具，对话时会自动调用，无需手动指定。

| 类别 | 工具 | 功能 |
|------|------|------|
| **库管理** | `list_collections` | 查看所有库 |
| | `create_collection` | 新建库 |
| | `delete_collection` | 删除库（带二次确认） |
| | `update_collection_description` | 修改库描述 |
| **论文管理** | `list_papers` | 列出库内论文 |
| | `view_paper` | 查看论文详情 |
| | `remove_from_collection` | 从库内移除 |
| | `delete_paper_globally` | 彻底删除论文 |
| **智能路由** | `suggest_collection` | 判断主题该进哪个库 |
| | `route_query` | 判断问题该搜哪个库 |
| **抓取** | `search_arxiv` | 搜 arXiv |
| | `download_to_collection` | 下载到指定库 |
| **索引** | `index_collection` | 建/更新向量索引 |
| | `index_stats` | 查看索引状态 |
| **检索** | `search_papers` | 段落级语义检索 |

---

## 🏗️ 架构

```
┌─────────────────────────────────────────────────────────┐
│   你 (Pi 终端 TUI)                                      │
└──────────────┬──────────────────────────────────────────┘
               │ 自然语言
               ▼
┌─────────────────────────────────────────────────────────┐
│   Pi Agent Framework                                    │
│   (@earendil-works/pi-coding-agent)                     │
│   ─ InteractiveMode (TUI 渲染、输入循环)                │
│   ─ SessionManager  (会话状态、历史)                    │
│   ─ ModelRegistry   (OpenAI/DeepSeek 多 provider 适配)  │
│   ─ Tool Dispatcher (function-calling 调度)             │
└──────────────┬──────────────────────────────────────────┘
               │ customTools 注入
               ▼
┌─────────────────────────────────────────────────────────┐
│   15 个自定义工具 (src/tools/)                          │
│   ┌──────────┬──────────┬──────────┬──────────┐         │
│   │ 库管理   │ 路由     │ 抓取     │ 检索     │         │
│   └────┬─────┴────┬─────┴────┬─────┴────┬─────┘         │
└────────┼──────────┼──────────┼──────────┼───────────────┘
         │          │          │          │
         ▼          ▼          ▼          ▼
   ┌─────────┐ ┌────────┐ ┌────────┐ ┌──────────────────┐
   │ SQLite  │ │ Vector │ │ arXiv  │ │ Embedding        │
   │ (元数据)│ │ Store  │ │  API   │ │  (任意 OpenAI    │
   │ sql.js  │ │ (JSON) │ │        │ │  兼容服务 / TF-IDF)│
   └─────────┘ └────────┘ └────────┘ └──────────────────┘
                  ▲
                  │
   ┌──────────────┴──────────────┐
   │ PDF Layout Pipeline         │
   │ Node ─spawn─> Python        │
   │ (pdfminer.six 坐标分析)     │
   └─────────────────────────────┘
```

### Pi 框架集成方式

`src/main.ts` 的核心调用链：

```typescript
import {
  InteractiveMode,
  SessionManager,
  ModelRegistry,
  AuthStorage,
  createAgentSessionRuntime,
  createAgentSessionFromServices,
  createAgentSessionServices,
} from "@earendil-works/pi-coding-agent";
import { getModel } from "@earendil-works/pi-ai";
import { ALL_TOOLS } from "./tools/index.ts";
import { SYSTEM_PROMPT } from "./prompt.ts";

// 1. 通过 ModelRegistry 注册模型 (走 openai provider，base URL 指向 DeepSeek)
const model = getModel("openai", "gpt-4");

// 2. 把 15 个自定义工具注入 Pi 的 session
const services = await createAgentSessionServices({
  cwd, authStorage, modelRegistry,
  resourceLoaderOptions: { systemPromptOverride: () => SYSTEM_PROMPT },
});
await createAgentSessionFromServices({
  services, sessionManager, sessionStartEvent,
  model,
  noTools: "builtin",          // 关掉 Pi 的内置工具
  customTools: ALL_TOOLS,      // 只暴露我们的 15 个论文工具
});

// 3. 启动 Pi 的交互式 TUI
await new InteractiveMode(runtime, { ... }).run();
```

### 数据流

1. **抓取**：`search_arxiv` 拉元数据 → 用户挑选 → `download_to_collection` 下载 PDF（每篇间隔 3s 限流）
2. **索引**：PDF → **Python pdfminer.six 子进程**（坐标重排双栏、过滤水印/行号、合并断词）→ 按章节关键词严格切段 → 切成 ~200 token chunk（超长段落硬切）→ 调 Embedding 服务（批量 32 / 单条重试 / 空 chunk 跳过）→ 写入 JSON 向量库
3. **检索**：query → Embedding → cosine similarity → Top-K chunks → 带章节定位返回给 Pi Agent

### 关键设计

- **Pi 作为 Agent 内核**：复用 Pi 的会话管理、TUI 渲染、工具调度，业务方只写工具实现
- **SQLite 存元数据**（库、论文、chunk 索引），向量单独存 JSON —— 简单透明，零运维
- **PDF 解析跨语言**：Node 端写薄 IPC 包装，Python 端用 pdfminer.six 拿到每个文本块的 (x, y) 坐标，按 x 中点聚类成左右栏后分别 top-down 重排，避免双栏论文文本被穿插；行末连字符（`typi-\ncally` → `typically`）也在这一步合并
- **章节识别严格化**：关键词必须独占一行（≤ 60 字符）才算真章节标题，避免正文里随便提一句 "Method" 就被误判成章节边界
- **Embedding 后端可换**：用 `EMBED_BASE_URL` + `EMBED_API_KEY` + `EMBED_MODEL` 接任意 OpenAI 兼容服务；失败分类（timeout / auth / 400）做不同处理：批量失败 → 单条重试，单条失败 → 零向量占位，整体失败 → 翻 TF-IDF 兜底
- **Chunk 上限自适应**：bge-large 这类 512-token 模型对密集表格内容很敏感，chunker 默认目标 200 token、超长段落硬切，确保不撞 embedding 服务的 token 上限
- **限流保护**：arXiv API 调用间隔 3s（官方推荐），避免被封

---

## 📂 项目结构

```
paper-agent/
├── src/
│   ├── main.ts                # ⭐ 主入口：Pi Agent + InteractiveMode TUI
│   ├── main-simple.ts         # 备用入口：调试时绕过 Pi 的最小 OpenAI SDK 实现
│   ├── prompt.ts              # 注入到 Pi session 的系统提示词
│   ├── init-db.ts             # 数据库初始化
│   ├── tools/                 # 注入到 Pi 的 customTools
│   │   ├── collections/       # 库管理
│   │   ├── papers/            # 论文管理
│   │   ├── routing/           # 智能路由
│   │   ├── crawl/             # arXiv 爬取
│   │   ├── index/             # 索引构建
│   │   └── search/            # 检索
│   └── utils/
│       ├── db.ts              # SQLite (sql.js) 封装
│       ├── chroma.ts          # 向量存储（JSON 持久化）
│       ├── embedding.ts       # Embedding 多后端 + 401/超时降级
│       ├── arxiv-api.ts       # arXiv API 客户端
│       ├── pdf-parser.ts      # PDF 解析 IPC 包装（spawn Python）
│       └── pdf_parser.py      # ⭐ Python 端：pdfminer.six layout 分析
├── data/
│   └── papers/                # 下载的 PDF（按 arXiv ID 命名）
├── index/
│   ├── papers.db              # SQLite 元数据
│   └── vector_papers_*.json   # 各库的向量索引
├── requirements.txt           # Python 依赖（pdfminer.six）
├── .env.example               # 环境变量模板
└── package.json
```

---

## 💡 典型工作流

### 1. 第一次建库

```text
你: 我想研究 agent 框架
你: 新建一个叫 agent-frameworks 的库
你: 在 arXiv 搜 "LLM agent framework"，20 篇
你: 下载前 10 篇
你: 建索引
你: 这些框架是怎么处理工具调用的？
```

### 2. 跨库检索

当库不止一个时，Agent 会自动用 `route_query` 判断该搜哪些库：

```text
你: RAG 和 agent 怎么结合？

Agent: [route_query] → 推荐 rag、agent-frameworks 两个库
       [search_papers in rag]
       [search_papers in agent-frameworks]
       综合两个库的结果回答...
```

### 3. 库的迭代

```text
你: 看看 rag 库里都有什么
你: 把 2310.11511 移到 advanced-rag 库
你: 给 rag 库加点 long-context 方向的论文
```

---

## ⚙️ 进阶配置

### 切换更快/更便宜的模型

`src/main-simple.ts` 里硬编码用的是 `deepseek-v4-flash`，如需换其他模型修改：

```typescript
let response = await client.chat.completions.create({
  model: "deepseek-v4-pro",  // 改这里
  ...
});
```

### 完全离线运行（不推荐）

不配 `EMBED_*` 三件套时系统降级到 TF-IDF。**真心不推荐生产使用**：当前实现里 query 端和文档端的词表是各自独立计算的，跨调用对不齐，余弦相似度的可比性会打折。**只把它当作"完全断网时索引也不会崩"的兜底**。

| | 远程 Embedding（bge-large / text-embedding-3） | TF-IDF（兜底） |
|---|---|---|
| 维度 | 1024 / 1536（固定） | 取决于词表 |
| 精度 | 高（理解语义、识别同义词） | 低（仅词频） |
| 网络 | 必需 | 离线 |
| 同义词 | ✅ | ❌ |
| 跨调用一致性 | ✅ | ❌（query 和文档词表错位） |

### 重置数据库

```bash
rm -rf index/papers.db index/vector_*.json data/papers/*.pdf
npm run init
```

---

## 🐛 常见问题

**Q: 启动报 API key 错误**
检查 `.env` 文件是否在项目根目录，且 `DEEPSEEK_API_KEY` 有值。

**Q: arXiv 下载 403**
arXiv 限流，等 10 分钟再试，或减少单次下载数量。代码已内置每篇 3s 间隔。

**Q: PDF 解析报 `python: command not found` 或 `No module named 'pdfminer'`**
确认装了 Python 3.8+ 和 pdfminer.six。Windows 下 Python 命令可能叫 `py`，把 `PYTHON_BIN=py` 加到 `.env` 即可。装依赖：`pip install -r requirements.txt`。

**Q: PDF 解析失败：`No /Root object! - Is this really a PDF?`**
PDF 文件本身损坏（下载没完成）。删 `data/papers/<arxiv-id>.pdf` 让 agent 重新下载。

**Q: 索引时 embedding 报 `status 400`**
通常是 chunk 超过 embedding 模型 token 上限。代码已内置批量失败 → 单条重试 → 零向量占位的兜底，不会让整库崩。如果某一篇大量 chunk 都失败，看下日志里打印的具体错误体。

**Q: 想换更强 / 中文 embedding 模型**
改 `.env` 里的 `EMBED_MODEL` 即可（中文论文推荐 `BAAI/bge-large-zh-v1.5`，多语言推荐 `BAAI/bge-m3`）。换模型后**必须 rebuild 全部索引**：让 agent 对每个库调 `index_collection`，传 `rebuild=true`。

**Q: 检索没结果**
确认库已索引完成，用 `index_stats` 检查段落数。

**Q: API 超时**
增大 `src/main-simple.ts` 里的 `timeout` 值，或检查网络/代理。

---

## 🤝 贡献

欢迎 PR。特别欢迎以下方向：

- 更精细的 PDF 解析（如 GROBID layout 分析）
- 支持更多论文源（Semantic Scholar、bioRxiv、ACL Anthology）
- Web UI / VS Code 插件
- 更好的 reranker（cross-encoder）
- 引用图分析（被引、引用关系）

---

## 📜 License

[MIT](./LICENSE) © 2026

---

## 🙏 致谢

- **[Pi Agent](https://github.com/earendil-works/pi)** —— 本项目的核心框架。Pi 提供了 Agent 会话管理、模型注册、工具调度、TUI 渲染等基础能力，本项目专注于实现论文管理领域的工具集。
- [arXiv API](https://arxiv.org/help/api/) —— 论文元数据来源
- [DeepSeek](https://platform.deepseek.com/) —— 性价比最高的中文友好 LLM
- [SiliconFlow](https://siliconflow.cn/) —— 国内可用的 OpenAI 兼容 embedding 服务
- [pdfminer.six](https://github.com/pdfminer/pdfminer.six) / [sql.js](https://github.com/sql-js/sql.js) —— 让 layout-aware PDF 解析与"零外部依赖"成为可能

