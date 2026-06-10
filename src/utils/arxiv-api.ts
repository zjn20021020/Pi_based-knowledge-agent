/**
 * arXiv API 客户端。
 * 文档: https://arxiv.org/help/api/
 */
import axios from "axios";
import xml2js from "xml2js";

export interface ArxivPaper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  published: string;
  pdfUrl: string;
  categories: string[];
}

const API_URL = "https://export.arxiv.org/api/query";

export async function searchArxiv(query: string, maxResults = 50): Promise<ArxivPaper[]> {
  const params = {
    search_query: query,
    start: 0,
    max_results: maxResults,
    sortBy: "submittedDate",
    sortOrder: "descending",
  };

  const response = await axios.get(API_URL, { params, timeout: 30000 });
  const parser = new xml2js.Parser();
  const result = await parser.parseStringPromise(response.data);

  const entries = result.feed.entry || [];
  return entries.map(parseEntry);
}

export async function fetchArxivById(id: string): Promise<ArxivPaper | null> {
  const response = await axios.get(API_URL, {
    params: { id_list: id },
    timeout: 30000,
  });
  const parser = new xml2js.Parser();
  const result = await parser.parseStringPromise(response.data);

  const entries = result.feed.entry || [];
  if (entries.length === 0) return null;
  return parseEntry(entries[0]);
}

function parseEntry(entry: any): ArxivPaper {
  // entry.id is like "http://arxiv.org/abs/2310.11511v2"
  const rawId: string = entry.id[0];
  const id = rawId.split("/abs/")[1].replace(/v\d+$/, "");

  return {
    id,
    title: String(entry.title[0]).trim().replace(/\s+/g, " "),
    authors: entry.author.map((a: any) => a.name[0]),
    abstract: String(entry.summary[0]).trim().replace(/\s+/g, " "),
    published: entry.published[0],
    pdfUrl: rawId.replace("/abs/", "/pdf/").replace(/v\d+$/, "").replace("http://", "https://") + ".pdf",
    categories: entry.category?.map((c: any) => c.$.term) || [],
  };
}

/**
 * Polite delay between arXiv API calls (recommended 3+ seconds).
 */
export function arxivDelay(): Promise<void> {
  return new Promise((r) => setTimeout(r, 3000));
}
