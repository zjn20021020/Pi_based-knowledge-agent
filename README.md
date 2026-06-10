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
- 📑 **段落级索引** —— PDF 解析后按学术章节（Method、Experiments…）切分，检索结果带章节定位
- 🔌 **OpenAI 兼容** —— 通过 Pi 的 ModelRegistry 接入任何 OpenAI 兼容 API：DeepSeek、OpenAI、Moonshot、本地模型
- 💾 **零外部服务** —— SQLite (sql.js) + JSON 向量存储，开箱即用，不用 Docker
- 🔄 **Embedding 自动降级** —— OpenAI Embedding 不可用时自动切换 TF-IDF 离线模式
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
- 一个 OpenAI 兼容的 API key（推荐 [DeepSeek](https://platform.deepseek.com/)，便宜又好用）
- 可选：OpenAI API key 用于 Embedding（没有也能跑，会自动切 TF-IDF）

### 安装

```bash
git clone https://github.com/<your-username>/paper-agent.git
cd paper-agent
npm install
cp .env.example .env
# 编辑 .env，填入你的 API key
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
# OpenAI 兼容 API（DeepSeek / OpenAI / Moonshot / ...）
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_BASE_URL=https://api.deepseek.com

# 模型选择
DEFAULT_MODEL=deepseek-v4-pro      # 主推理模型
REVIEW_MODEL=deepseek-v4-pro       # 审稿/检查模型
```

切换到 OpenAI：

```bash
OPENAI_API_KEY=sk-your-openai-key
OPENAI_BASE_URL=https://api.openai.com
DEFAULT_MODEL=gpt-4
```

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
   ┌─────────┐ ┌────────┐ ┌────────┐ ┌────────────┐
   │ SQLite  │ │ Vector │ │ arXiv  │ │ Embedding  │
   │ (元数据)│ │ Store  │ │  API   │ │  (OpenAI / │
   │ sql.js  │ │ (JSON) │ │        │ │   TF-IDF)  │
   └─────────┘ └────────┘ └────────┘ └────────────┘
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
2. **索引**：PDF → `pdf-parse` 提取文本 → 按学术章节关键词切分（Method/Experiments/...）→ 切成 ~300 token chunk → Embedding → 写入 JSON 向量库
3. **检索**：query → Embedding → cosine similarity → Top-K chunks → 带章节定位返回给 Pi Agent

### 关键设计

- **Pi 作为 Agent 内核**：复用 Pi 的会话管理、TUI 渲染、工具调度，业务方只写工具实现
- **SQLite 存元数据**（库、论文、chunk 索引），向量单独存 JSON —— 简单透明，零运维
- **Embedding 双后端**：优先 OpenAI `text-embedding-3-small` (1536 维)，超时/无 key 自动降级 TF-IDF
- **章节级 chunking**：识别 20+ 个常见学术小节标题，检索结果带章节归属，引用更精准
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
│       ├── embedding.ts       # Embedding（OpenAI + TF-IDF 降级）
│       ├── arxiv-api.ts       # arXiv API 客户端
│       └── pdf-parser.ts      # PDF 解析 + 章节切分
├── data/
│   └── papers/                # 下载的 PDF（按 arXiv ID 命名）
├── index/
│   ├── papers.db              # SQLite 元数据
│   └── vector_papers_*.json   # 各库的向量索引
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

### 完全离线运行

如果没有 OpenAI Embedding 访问权限，系统会自动用 TF-IDF。对**学术论文**这种术语重复率高的场景效果其实不错。

| | OpenAI Embedding | TF-IDF |
|---|---|---|
| 维度 | 1536 (固定) | 取决于词表 |
| 精度 | 高（理解语义） | 中（基于词频） |
| 网络 | 必需 | 离线 |
| 同义词 | ✅ | ❌ |
| 学术术语检索 | ✅✅ | ✅✅ |

### 重置数据库

```bash
rm -rf index/papers.db index/vector_*.json data/papers/*.pdf
npm run init
```

---

## 🐛 常见问题

**Q: 启动报 API key 错误**
检查 `.env` 文件是否在项目根目录，且 `OPENAI_API_KEY` 有值。

**Q: arXiv 下载 403**
arXiv 限流，等 10 分钟再试，或减少单次下载数量。代码已内置每篇 3s 间隔。

**Q: 索引时报 "OPENAI_API_KEY not set"**
没设 OpenAI key 时会自动切 TF-IDF，不影响功能。要用 OpenAI Embedding 就在 `.env` 加一个真正的 OpenAI key（DeepSeek key 不能用于 Embedding）。

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
- [pdf-parse](https://github.com/modesty/pdf-parse) / [sql.js](https://github.com/sql-js/sql.js) —— 让"零外部依赖"成为可能

