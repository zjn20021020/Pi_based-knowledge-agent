import { Type } from "@sinclair/typebox";
import { defineTool } from "../define-tool.ts";
import { existsSync, unlinkSync } from "fs";
import getDb from "../../utils/db.ts";

import { getCollectionIfExists } from "../../utils/chroma.ts";

export const deletePaperGlobally = defineTool({
  name: "delete_paper_globally",
  label: "Delete Paper Globally",
  description:
    "彻底删除一篇论文:从所有库中移除关联、删除所有库的索引段落、删除 PDF 文件。**这是不可恢复的危险操作**,必须先获得用户明确确认才能调用,且必须传 confirm: true。",
  parameters: Type.Object({
    paperId: Type.String({ description: "arXiv 论文 ID" }),
    confirm: Type.Boolean({
      description: "必须为 true 才会真正执行。如果用户没有明确说'彻底删除'或类似词,不要传 true。",
    }),
  }),
  execute: async (_id, { paperId, confirm }) => {
    const db = getDb();
    const paper = db
      .prepare("SELECT id, title, pdf_path FROM papers WHERE id = ?")
      .get(paperId) as { id: string; title: string; pdf_path: string } | undefined;

    if (!paper) {
      return {
        content: [{ type: "text", text: `❌ 论文 ${paperId} 不存在。` }],
        details: { error: "not_found" },
      };
    }

    const collections = db
      .prepare("SELECT collection_name FROM collection_papers WHERE paper_id = ?")
      .all(paperId) as Array<{ collection_name: string }>;

    if (!confirm) {
      return {
        content: [
          {
            type: "text",
            text: `⚠️ **危险操作:彻底删除论文**\n\n**${paper.title}**\nID: ${paperId}\n所属库: ${collections.map((c) => c.collection_name).join(", ") || "(无)"}\nPDF: ${paper.pdf_path}\n\n这会:\n- 从所有库中移除关联\n- 删除所有索引段落\n- 删除 PDF 文件\n\n**不可恢复**。请用户确认后,重新调用此工具并设置 confirm: true。`,
          },
        ],
        details: { needConfirm: true, paper, collections },
      };
    }

    // 1. 从每个 Chroma collection 删除该论文的 chunks
    for (const { collection_name } of collections) {
      const chunkIds = db
        .prepare("SELECT id FROM chunks WHERE paper_id = ? AND collection_name = ?")
        .all(paperId, collection_name)
        .map((r: any) => r.id) as string[];
      if (chunkIds.length > 0) {
        const chromaCol = await getCollectionIfExists(collection_name);
        if (chromaCol) await chromaCol.delete({ ids: chunkIds });
      }
    }

    // 2. SQLite:删 chunks、collection_papers、papers
    db.prepare("DELETE FROM chunks WHERE paper_id = ?").run(paperId);
    db.prepare("DELETE FROM collection_papers WHERE paper_id = ?").run(paperId);
    db.prepare("DELETE FROM papers WHERE id = ?").run(paperId);

    // 3. 删 PDF 文件
    let pdfDeleted = false;
    if (existsSync(paper.pdf_path)) {
      try {
        unlinkSync(paper.pdf_path);
        pdfDeleted = true;
      } catch {
        // ignore filesystem errors
      }
    }

    return {
      content: [
        {
          type: "text",
          text: `✅ 已彻底删除论文 ${paperId}: "${paper.title.slice(0, 60)}..."\n- 从 ${collections.length} 个库移除\n- PDF 文件: ${pdfDeleted ? "已删除" : "未找到或无法删除"}`,
        },
      ],
      details: { paperId, deletedFromCollections: collections.length, pdfDeleted },
    };
  },
});
