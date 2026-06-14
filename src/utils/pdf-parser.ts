/**
 * PDF 解析:通过 Python 子进程调用 pdfminer.six,处理双栏布局。
 *
 * Python 脚本(src/utils/pdf_parser.py)负责重活:
 *  - 用 pdfminer.six 拿到每个文本块的 (x, y) 坐标
 *  - 检测双栏布局,按"先左栏后右栏"的阅读顺序重排
 *  - 清掉 arXiv 水印、独立页码、会议横幅等噪声
 *  - 按学术章节关键词(Method、Experiments、…)切段
 *
 * 这里只做薄薄一层 IPC 封装:启子进程 → 拿 stdout JSON → 结构化返回。
 * chunkSections / estimateTokens 跟 PDF 本身无关,留在 TS 里。
 *
 * 依赖:
 *   - Python 3.8+(默认走 PATH 里的 `python`,可用 PYTHON_BIN 环境变量覆盖)
 *   - pdfminer.six(`pip install -r requirements.txt`)
 */
import { spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PY_SCRIPT = join(__dirname, "pdf_parser.py");
const PY_BIN = process.env.PYTHON_BIN || "python";

export interface Section {
  title: string;
  content: string;
}

export interface ParsedPaper {
  paperId: string;
  fullText: string;
  sections: Section[];
}

export async function parsePdf(pdfPath: string, paperId: string): Promise<ParsedPaper> {
  return new Promise<ParsedPaper>((resolve, reject) => {
    const proc = spawn(PY_BIN, [PY_SCRIPT, pdfPath, paperId], {
      stdio: ["ignore", "pipe", "pipe"],
      // Windows 中文 locale 下 Python 默认 stdout 走 GBK 编码,遇到 PDF 里
      // 的 Unicode(希腊字母、† 等)会挂。强制全程 UTF-8。
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    proc.on("error", (err) => {
      reject(
        new Error(
          `无法启动 Python (${PY_BIN}): ${err.message}\n` +
            `请确认已安装 Python 3.8+,或通过 PYTHON_BIN 环境变量指定路径。`,
        ),
      );
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        // 最常见的失败:依赖没装。给个清楚的提示。
        if (stderr.includes("No module named 'pdfminer'")) {
          reject(
            new Error(
              `Python 缺少 pdfminer.six 依赖。请运行:\n` +
                `  pip install pdfminer.six\n` +
                `或:\n` +
                `  pip install -r requirements.txt`,
            ),
          );
          return;
        }
        reject(new Error(`PDF 解析失败 (exit ${code}): ${stderr || stdout}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as ParsedPaper;
        resolve(parsed);
      } catch (e: any) {
        reject(
          new Error(
            `Python 输出无法解析为 JSON: ${e.message}\n` +
              `输出前 500 字符:${stdout.slice(0, 500)}`,
          ),
        );
      }
    });
  });
}

/**
 * 把章节切成 ~targetTokens 的 chunks。
 *
 * 切分规则:
 *   - 优先在段落边界切
 *   - 单个段落超过 targetTokens 也会被强制按 token 数硬切(否则表格、长算法块
 *     会形成一个巨大 chunk,撑爆 embedding 模型的 token 上限)
 *
 * targetTokens 的选择:bge-large 等中文/学术 embedding 模型上下文 512 token,
 * 表格/数字这类密集内容每字符 token 数高,所以默认 200 留 60% 的安全余量。
 * 如果你换成 OpenAI text-embedding-3-small(8192 token),可以放心调到 500+。
 */
export interface Chunk {
  sectionTitle: string;
  content: string;
}

export function chunkSections(sections: Section[], targetTokens = 200): Chunk[] {
  const chunks: Chunk[] = [];

  for (const section of sections) {
    const paragraphs = section.content.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    let buffer = "";

    for (const para of paragraphs) {
      // 段落本身就超长 → 先把 buffer 推出去,然后把这个段落硬切成多块
      if (estimateTokens(para) > targetTokens) {
        if (buffer.trim().length > 0) {
          chunks.push({ sectionTitle: section.title, content: buffer.trim() });
          buffer = "";
        }
        for (const piece of hardSplit(para, targetTokens)) {
          chunks.push({ sectionTitle: section.title, content: piece });
        }
        continue;
      }

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

/**
 * 把一段超长文本硬切成 <=targetTokens 的小段。
 * 优先在句子边界切,实在不行才在词边界切。
 */
function hardSplit(text: string, targetTokens: number): string[] {
  const targetChars = targetTokens * 4;
  const out: string[] = [];
  // 按句子(. ! ? 后跟空格或换行)切片
  const sentences = text.split(/(?<=[.!?])\s+/);
  let buf = "";
  for (const s of sentences) {
    if (estimateTokens(s) > targetTokens) {
      // 单句还超长(算法块/超长表格行)→ 按字符硬切
      if (buf.trim()) {
        out.push(buf.trim());
        buf = "";
      }
      for (let i = 0; i < s.length; i += targetChars) {
        out.push(s.slice(i, i + targetChars).trim());
      }
      continue;
    }
    if (estimateTokens(buf + " " + s) > targetTokens && buf.length > 0) {
      out.push(buf.trim());
      buf = s;
    } else {
      buf += (buf ? " " : "") + s;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter((p) => p.length > 0);
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
