import { Type } from "@sinclair/typebox";
import { defineTool } from "../define-tool.ts";
import { searchArxiv } from "../../utils/arxiv-api.ts";

export const searchArxivTool = defineTool({
  name: "search_arxiv",
  label: "Search arXiv",
  description:
    "在 arXiv 上搜索论文,只返回元数据(标题、作者、摘要、ID),不下载 PDF。展示给用户后由用户决定下载哪些。",
  parameters: Type.Object({
    query: Type.String({
      description:
        "arXiv 搜索查询。可以用普通关键词,也可以用字段限定:'ti:retrieval' (标题)、'au:smith' (作者)、'cat:cs.AI' (类别)。可用 AND/OR/NOT 组合。",
    }),
    maxResults: Type.Optional(
      Type.Number({ description: "最多返回多少篇,默认 30,上限 100", default: 30 }),
    ),
  }),
  execute: async (_id, { query, maxResults = 30 }) => {
    const limit = Math.min(maxResults, 100);
    const papers = await searchArxiv(query, limit);

    if (papers.length === 0) {
      return {
        content: [{ type: "text", text: `🔍 查询 "${query}" 没有命中任何论文。换个关键词试试?` }],
        details: { papers: [], query },
      };
    }

    const text = papers
      .map((p, i) => {
        const authors = p.authors.length > 3 ? `${p.authors.slice(0, 3).join(", ")} 等` : p.authors.join(", ");
        return `${i + 1}. **${p.title}**\n   ID: \`${p.id}\` | 发表: ${p.published.slice(0, 10)} | 作者: ${authors}\n   分类: ${p.categories.slice(0, 3).join(", ")}\n   摘要: ${p.abstract.slice(0, 200)}...`;
      })
      .join("\n\n");

    return {
      content: [
        {
          type: "text",
          text: `🔍 查询 "${query}" 找到 ${papers.length} 篇论文(按发表时间倒序):\n\n${text}\n\n下一步:把要下载的论文 ID 传给 download_to_collection。`,
        },
      ],
      details: { papers, query },
    };
  },
});
