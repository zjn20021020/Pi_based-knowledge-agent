/**
 * PDF 解析:从 PDF 提取文本并按章节切分。
 *
 * 章节识别策略:基于常见学术论文小节标题(Abstract、Introduction、Method 等)。
 * 这是简化版,生产级可改用更精细的 layout 分析(如 GROBID)。
 */
import { readFileSync } from "fs";
import pdf from "pdf-parse";

export interface Section {
  title: string;
  content: string;
}

export interface ParsedPaper {
  paperId: string;
  fullText: string;
  sections: Section[];
}

const SECTION_KEYWORDS = [
  "Abstract",
  "Introduction",
  "Background",
  "Related Work",
  "Preliminaries",
  "Method",
  "Methods",
  "Methodology",
  "Approach",
  "Model",
  "Experiments",
  "Experimental Setup",
  "Evaluation",
  "Results",
  "Discussion",
  "Analysis",
  "Limitations",
  "Conclusion",
  "Conclusions",
  "Future Work",
  "References",
  "Acknowledgments",
];

export async function parsePdf(pdfPath: string, paperId: string): Promise<ParsedPaper> {
  const buf = readFileSync(pdfPath);
  const data = await pdf(buf);
  const fullText = data.text;
  const sections = extractSections(fullText);
  return { paperId, fullText, sections };
}

function extractSections(text: string): Section[] {
  // 找每个关键词在文本里第一次以"独立行"出现的位置
  const matches: Array<{ keyword: string; index: number }> = [];
  for (const kw of SECTION_KEYWORDS) {
    // 大致匹配:行首或换行后的关键词,可带可选数字编号
    const pattern = new RegExp(`(?:^|\\n)\\s*\\d{0,2}\\.?\\s*${kw}\\b`, "i");
    const m = text.match(pattern);
    if (m && m.index !== undefined) {
      matches.push({ keyword: kw, index: m.index });
    }
  }

  if (matches.length === 0) {
    // 找不到任何章节,把全文作为一个 "Body" 段
    return [{ title: "Body", content: text.trim() }];
  }

  matches.sort((a, b) => a.index - b.index);

  const sections: Section[] = [];

  // 第一个章节之前的内容(标题、作者、摘要前的部分)归到 "Header"
  if (matches[0].index > 50) {
    const header = text.slice(0, matches[0].index).trim();
    if (header.length > 20) {
      sections.push({ title: "Header", content: header });
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const content = text.slice(start, end).trim();
    if (content.length > 50) {
      sections.push({ title: matches[i].keyword, content });
    }
  }

  return sections;
}

/**
 * 把章节切成 ~300 token 的 chunks。
 * Chunk 内尽量保持段落边界。
 */
export interface Chunk {
  sectionTitle: string;
  content: string;
}

export function chunkSections(sections: Section[], targetTokens = 300): Chunk[] {
  const chunks: Chunk[] = [];

  for (const section of sections) {
    const paragraphs = section.content.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    let buffer = "";

    for (const para of paragraphs) {
      if (estimateTokens(buffer + para) > targetTokens && buffer.length > 0) {
        chunks.push({ sectionTitle: section.title, content: buffer.trim() });
        buffer = para;
      } else {
        buffer += (buffer ? "\n\n" : "") + para;
      }
    }
    if (buffer.trim().length > 0) {
      chunks.push({ sectionTitle: section.title, content: buffer.trim() });
    }
  }

  return chunks;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
