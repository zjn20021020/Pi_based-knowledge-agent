import { Type } from "@sinclair/typebox";
import { defineTool } from "../define-tool.ts";
import getDb from "../../utils/db.ts";


export const viewPaper = defineTool({
  name: "view_paper",
  label: "View Paper",
  description:
    "查看一篇论文的详细信息,包括标题、作者、摘要、所属的所有库、是否已索引。",
  parameters: Type.Object({
    paperId: Type.String({ description: "arXiv 论文 ID,如 '2310.11511'" }),
  }),
  execute: async (_id, { paperId }) => {
    const db = getDb();
    const paper = db
      .prepare(
        "SELECT id, title, authors, abstract, published, pdf_path, parsed_at FROM papers WHERE id = ?",
      )
      .get(paperId) as
      | {
          id: string;
          title: string;
          authors: string;
          abstract: string;
          published: string;
          pdf_path: string;
          parsed_at: string | null;
        }
      | undefined;

    if (!paper) {
      return {
        content: [{ type: "text", text: `❌ 未找到论文 ${paperId}。` }],
        details: { error: "not_found" },
      };
    }

    const collections = db
      .prepare("SELECT collection_name, added_at FROM collection_papers WHERE paper_id = ?")
      .all(paperId) as Array<{ collection_name: string; added_at: string }>;

    const authors = JSON.parse(paper.authors) as string[];

    const colText =
      collections.length === 0
        ? "⚠️ 该论文不在任何库中(可考虑用 delete_paper_globally 清理)"
        : collections.map((c) => `- ${c.collection_name} (加入于 ${c.added_at.slice(0, 10)})`).join("\n");

    const text = `# ${paper.title}

**ID**: \`${paper.id}\`
**作者**: ${authors.join(", ")}
**发表**: ${paper.published.slice(0, 10)}
**索引状态**: ${paper.parsed_at ? `已索引 (${paper.parsed_at.slice(0, 10)})` : "未索引"}
**PDF**: ${paper.pdf_path}

## 摘要
${paper.abstract}

## 所属库 (${collections.length})
${colText}`;

    return {
      content: [{ type: "text", text }],
      details: { paper, collections },
    };
  },
});
