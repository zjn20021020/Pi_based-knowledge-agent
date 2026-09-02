import { Type } from "@sinclair/typebox";
import { defineTool } from "../define-tool.ts";
import getDb from "../../utils/db.ts";


const NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,30}$/;

export const createCollection = defineTool({
  name: "create_collection",
  label: "Create Collection",
  description:
    "新建一个论文库。库名只能包含小写字母、数字、下划线、连字符,长度 1-31。描述应清晰说明库的主题范围,会用于智能路由判断。",
  parameters: Type.Object({
    name: Type.String({
      description: "库名(英文,小写,如 'rag-survey'、'multi-agent')",
    }),
    description: Type.String({
      description:
        "库的主题描述,说明这个库收录什么样的论文。会用于自动判断新论文应进入哪个库,所以应当具体明确。例如: 'RAG 综述、检索策略、生成质量评估'。",
    }),
  }),
  execute: async (_id, { name, description }) => {
    if (!NAME_PATTERN.test(name)) {
      return {
        content: [
          {
            type: "text",
            text: `❌ 库名格式不合法。要求:小写字母/数字开头,只含小写字母、数字、下划线、连字符,长度 1-31。`,
          },
        ],
        details: { error: "invalid_name" },
      };
    }

    const db = getDb();
    const existing = db.prepare("SELECT name FROM collections WHERE name = ?").get(name);
    if (existing) {
      return {
        content: [{ type: "text", text: `❌ 库 "${name}" 已存在。请用其他名字,或调用 update_collection_description 修改描述。` }],
        details: { error: "already_exists" },
      };
    }

    db.prepare(
      "INSERT INTO collections (name, description, created_at) VALUES (?, ?, ?)",
    ).run(name, description, new Date().toISOString());

    return {
      content: [
        {
          type: "text",
          text: `✅ 已创建库 **${name}**\n描述: ${description}\n\n下一步可以用 search_arxiv 搜索论文,再用 download_to_collection 下载到这个库。`,
        },
      ],
      details: { name, description },
    };
  },
});
