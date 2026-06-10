/**
 * 集中导出所有工具,供 main.ts 注入到 agent。
 */
import { listCollections } from "./collections/list-collections.ts";
import { createCollection } from "./collections/create-collection.ts";
import { deleteCollection } from "./collections/delete-collection.ts";
import { updateCollectionDescription } from "./collections/update-description.ts";

import { listPapers } from "./papers/list-papers.ts";
import { viewPaper } from "./papers/view-paper.ts";
import { removeFromCollection } from "./papers/remove-from-collection.ts";
import { deletePaperGlobally } from "./papers/delete-paper-globally.ts";

import { suggestCollection } from "./routing/suggest-collection.ts";
import { routeQuery } from "./routing/route-query.ts";

import { searchArxivTool } from "./crawl/search-arxiv.ts";
import { downloadToCollection } from "./crawl/download-to-collection.ts";

import { indexCollection } from "./index/index-collection.ts";
import { indexStats } from "./index/index-stats.ts";

import { searchPapers } from "./search/search-papers.ts";

export const ALL_TOOLS = [
  // 库管理
  listCollections,
  createCollection,
  deleteCollection,
  updateCollectionDescription,
  // 论文管理
  listPapers,
  viewPaper,
  removeFromCollection,
  deletePaperGlobally,
  // 智能路由
  suggestCollection,
  routeQuery,
  // 爬取
  searchArxivTool,
  downloadToCollection,
  // 索引
  indexCollection,
  indexStats,
  // 检索
  searchPapers,
];
