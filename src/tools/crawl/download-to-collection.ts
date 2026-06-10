import { Type } from "@sinclair/typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import axios from "axios";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import getDb from "../../utils/db.ts";

import { fetchArxivById, arxivDelay } from "../../utils/arxiv-api.ts";

const PAPERS_DIR = join(process.cwd(), "data", "papers");

export const downloadToCollection = defineTool({
  name: "download_to_collection",
  label: "Download to Collection",
  description:
    "下载指定的 arXiv 论文 PDF 并加入到指定库。已下载的论文会跳过 PDF 下载,只新增库的关联。下载是流式的,会实时报告进度,可中断。下载完成后必须再调 index_collection 才能搜索。",
  parameters: Type.Object({
    paperIds: Type.Array(Type.String(), {
      description: "arXiv 论文 ID 列表,如 ['2310.11511', '2305.14283']",
    }),
    collectionName: Type.String({ description: "目标库名,必须先用 create_collection 创建" }),
  }),
  execute: async (_id, { paperIds, collectionName }, signal, onUpdate) => {
    const db = getDb();
    mkdirSync(PAPERS_DIR, { recursive: true });

    const collection = db.prepare("SELECT name FROM collections WHERE name = ?").get(collectionName);
    if (!collection) {
      return {
        content: [
          {
            type: "text",
            text: `❌ 库 "${collectionName}" 不存在。请先用 create_collection 创建。`,
          },
        ],
        details: { error: "collection_not_found" },
      };
    }

    const total = paperIds.length;
    let newDownloaded = 0;
    let skippedExist = 0;
    let newlyLinked = 0;
    let alreadyLinked = 0;
    let failed = 0;
    const log: string[] = [];

    for (let i = 0; i < paperIds.length; i++) {
      if (signal?.aborted) {
        log.push(`⚠️ 用户中断,完成 ${i}/${total}`);
        break;
      }

      const id = paperIds[i].trim();

      onUpdate?.({
        content: [{ type: "text", text: `处理 ${i + 1}/${total}: ${id}...` }],
        details: { progress: { current: i + 1, total, currentId: id } },
      });

      try {
        const existing = db
          .prepare("SELECT id, pdf_path FROM papers WHERE id = ?")
          .get(id) as { id: string; pdf_path: string } | undefined;

        if (existing) {
          skippedExist++;
          log.push(`⏭️  ${id}: 已下载过`);
        } else {
          const meta = await fetchArxivById(id);
          if (!meta) {
            failed++;
            log.push(`❌ ${id}: arXiv 上找不到`);
            continue;
          }

          const pdfPath = join(PAPERS_DIR, `${id}.pdf`);
          if (!existsSync(pdfPath)) {
            const pdfResp = await axios.get(meta.pdfUrl, {
              responseType: "arraybuffer",
              timeout: 120000,
              signal,
            });
            writeFileSync(pdfPath, pdfResp.data);
          }

          db.prepare(
            "INSERT INTO papers (id, title, authors, abstract, published, pdf_path) VALUES (?, ?, ?, ?, ?, ?)",
          ).run(
            id,
            meta.title,
            JSON.stringify(meta.authors),
            meta.abstract,
            meta.published,
            pdfPath,
          );

          newDownloaded++;
          log.push(`✅ ${id}: ${meta.title.slice(0, 60)}`);

          await arxivDelay();
        }

        const linked = db
          .prepare("SELECT 1 FROM collection_papers WHERE collection_name = ? AND paper_id = ?")
          .get(collectionName, id);
        if (!linked) {
          db.prepare(
            "INSERT INTO collection_papers (collection_name, paper_id, added_at) VALUES (?, ?, ?)",
          ).run(collectionName, id, new Date().toISOString());
          newlyLinked++;
        } else {
          alreadyLinked++;
        }
      } catch (err: any) {
        failed++;
        log.push(`❌ ${id}: ${err.message || err}`);
      }
    }

    const summary = `📊 完成统计 (库: ${collectionName})
- 新下载 PDF: ${newDownloaded} 篇
- PDF 已存在跳过: ${skippedExist} 篇
- 新加入库: ${newlyLinked} 篇
- 已在库中(无变化): ${alreadyLinked} 篇
- 失败: ${failed} 篇

详情:
${log.join("\n")}

⚠️ **下一步**:调用 \`index_collection("${collectionName}")\` 给新加入的论文建索引,否则无法被检索。`;

    return {
      content: [{ type: "text", text: summary }],
      details: {
        collectionName,
        newDownloaded,
        skippedExist,
        newlyLinked,
        alreadyLinked,
        failed,
        aborted: signal?.aborted ?? false,
      },
    };
  },
});
