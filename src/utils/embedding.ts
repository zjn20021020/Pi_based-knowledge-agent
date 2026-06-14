/**
 * Embedding 生成 - 三档后端
 *
 * 优先级:
 *   1. EMBED_API_KEY + EMBED_BASE_URL + EMBED_MODEL
 *      任意 OpenAI 兼容 embedding 服务(阿里云灵积 / 智谱 / SiliconFlow / Voyage / 自部署 BGE...)。
 *   2. OPENAI_API_KEY 走真 OpenAI(国内大概率连不上,会自动降级)
 *   3. TF-IDF 离线模式
 *
 * 关键修复(对比旧版):
 *   - 不再硬编码 https://api.openai.com/v1/embeddings,允许指向兼容服务
 *   - 401/403 认证错误也降级,不再直接 throw 让整篇论文索引崩
 *   - timeout 降级时只翻一次 useRemote,后续不再尝试网络请求(避免每篇等 10 秒)
 *   - 输入长度限制改成 2000 chars(适配 bge 512 token,而不是 OpenAI 的 8192)
 *   - 批量从 100 降到 32(适配 SiliconFlow 等国内服务的批量上限)
 *   - 空字符串 chunk 在送出前过滤,避免 400
 *   - 单批失败时退化为单条重试,捞回大多数能成功的输入
 *   - 错误日志打印服务端真实错误体,不再只看到"status 400"
 */
import axios from "axios";

// bge-large 上下文 512 token。学术论文的表格/数字内容每字符 token 数远高于普通
// 英文,所以这里截到 1500 chars(理论 ~375 token,留 27% 余量)。如果你换成
// OpenAI text-embedding-3-small(8192 token)可以放心调到 8000。
const MAX_INPUT_CHARS = 1500;
// SiliconFlow / 阿里云 / 智谱 的批量上限通常在 25–64 之间,32 是安全公约数。
const BATCH_SIZE = 32;

interface RemoteConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

function resolveRemoteConfig(): RemoteConfig | null {
  // 第一档:显式 EMBED_* 三件套(推荐配法)
  const embedKey = process.env.EMBED_API_KEY;
  const embedBase = process.env.EMBED_BASE_URL;
  if (embedKey && embedBase) {
    return {
      apiKey: embedKey,
      baseUrl: embedBase.replace(/\/$/, ""),
      model: process.env.EMBED_MODEL || "text-embedding-3-small",
    };
  }
  // 第二档:旧版 OPENAI_API_KEY 直连
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return {
      apiKey: openaiKey,
      baseUrl: "https://api.openai.com/v1",
      model: "text-embedding-3-small",
    };
  }
  return null;
}

let _cache = new Map<string, number[]>();
const CACHE_LIMIT = 1000;

// TF-IDF 后备方案
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function computeTfIdf(texts: string[]): number[][] {
  // 构建词表
  const vocab = new Set<string>();
  const tokenizedTexts = texts.map((text) => {
    const tokens = tokenize(text);
    tokens.forEach((t) => vocab.add(t));
    return tokens;
  });

  const vocabArray = Array.from(vocab);
  const vocabIndex = new Map(vocabArray.map((word, i) => [word, i]));

  // 计算 IDF
  const docCount = texts.length;
  const idf = new Map<string, number>();
  vocabArray.forEach((word) => {
    const docsWithWord = tokenizedTexts.filter((tokens) => tokens.includes(word)).length;
    idf.set(word, Math.log(docCount / (docsWithWord + 1)));
  });

  // 生成向量
  return tokenizedTexts.map((tokens) => {
    const vector = new Array(vocabArray.length).fill(0);
    const tf = new Map<string, number>();

    tokens.forEach((token) => {
      tf.set(token, (tf.get(token) || 0) + 1);
    });

    tf.forEach((freq, word) => {
      const idx = vocabIndex.get(word)!;
      vector[idx] = freq * (idf.get(word) || 0);
    });

    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return norm > 0 ? vector.map((v) => v / norm) : vector;
  });
}

// 模块级状态:第一次失败后翻成 false,session 内不再重试
let useRemote = true;
let remoteConfig: RemoteConfig | null | undefined = undefined; // undefined 表示尚未解析

function getRemoteConfig(): RemoteConfig | null {
  if (remoteConfig === undefined) {
    remoteConfig = resolveRemoteConfig();
    if (!remoteConfig) {
      console.warn("⚠️ 未配置 EMBED_API_KEY 或 OPENAI_API_KEY,使用 TF-IDF 离线模式");
      useRemote = false;
    } else {
      console.log(`✓ Embedding: ${remoteConfig.baseUrl} / ${remoteConfig.model}`);
    }
  }
  return remoteConfig;
}

function classifyError(err: any): "timeout" | "auth" | "other" {
  if (err.code === "ETIMEDOUT" || err.code === "ECONNABORTED" || err.code === "ECONNREFUSED") {
    return "timeout";
  }
  const status = err.response?.status;
  if (status === 401 || status === 403) return "auth";
  return "other";
}

function shouldFallback(err: any): boolean {
  const kind = classifyError(err);
  if (kind === "timeout") {
    console.warn("⚠️ Embedding 服务超时/无法连接,切换到 TF-IDF 离线模式");
    return true;
  }
  if (kind === "auth") {
    console.warn("⚠️ Embedding 认证失败 (401/403),切换到 TF-IDF 离线模式");
    return true;
  }
  return false;
}

// 把服务端的真实错误体打出来,不要让用户只看到"status 400"。
function logServerError(err: any, context: string): void {
  const status = err.response?.status;
  const body = err.response?.data;
  let detail = "";
  if (body) {
    detail = typeof body === "string" ? body : JSON.stringify(body);
    if (detail.length > 500) detail = detail.slice(0, 500) + "...(truncated)";
  }
  console.warn(`Embedding 调用失败 [${context}] status=${status} body=${detail || "(empty)"}`);
}

// 把输入清理成 embedding 服务能吃的形态。空串/超长返回 null = 跳过。
function sanitize(text: string): string | null {
  if (!text) return null;
  // 折叠所有空白(PDF 提取后常有大量换行/制表)
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return null;
  return collapsed.slice(0, MAX_INPUT_CHARS);
}

async function callBatch(cfg: RemoteConfig, batch: string[]): Promise<number[][]> {
  const response = await axios.post(
    `${cfg.baseUrl}/embeddings`,
    { model: cfg.model, input: batch },
    { headers: { Authorization: `Bearer ${cfg.apiKey}` }, timeout: 30000 },
  );
  return response.data.data.map((d: { embedding: number[] }) => d.embedding);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const cached = _cache.get(text);
  if (cached) return cached;

  const cleaned = sanitize(text);
  if (useRemote && cleaned) {
    const cfg = getRemoteConfig();
    if (cfg) {
      try {
        const [embedding] = await callBatch(cfg, [cleaned]);

        if (_cache.size >= CACHE_LIMIT) {
          _cache = new Map();
        }
        _cache.set(text, embedding);

        return embedding;
      } catch (err: any) {
        logServerError(err, "single");
        if (shouldFallback(err)) {
          useRemote = false;
        } else {
          throw err;
        }
      }
    }
  }

  // TF-IDF 后备
  const vector = computeTfIdf([text])[0];
  _cache.set(text, vector);
  return vector;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  // 先清洗:把空白折叠 + 截断到 MAX_INPUT_CHARS。空 chunk 标 null,但保留位置占位。
  const sanitized: (string | null)[] = texts.map(sanitize);
  const validIndices: number[] = [];
  const validInputs: string[] = [];
  for (let i = 0; i < sanitized.length; i++) {
    if (sanitized[i] !== null) {
      validIndices.push(i);
      validInputs.push(sanitized[i] as string);
    }
  }
  const skipped = texts.length - validInputs.length;
  if (skipped > 0) {
    console.warn(`⚠️ 跳过 ${skipped} 个空 chunk(避免 400 错误)`);
  }

  // 准备和原 texts 等长的输出数组,空位用零向量占位(下游计算余弦时会得到 0,自动失效)。
  const placeholderDim = 1024;

  if (useRemote && validInputs.length > 0) {
    const cfg = getRemoteConfig();
    if (cfg) {
      try {
        const embeddings: number[][] = new Array(texts.length);
        // 预填占位向量
        for (let i = 0; i < texts.length; i++) {
          embeddings[i] = new Array(placeholderDim).fill(0);
        }

        for (let start = 0; start < validInputs.length; start += BATCH_SIZE) {
          const batch = validInputs.slice(start, start + BATCH_SIZE);
          const batchOriginalIdx = validIndices.slice(start, start + BATCH_SIZE);

          let batchEmbeds: number[][];
          try {
            batchEmbeds = await callBatch(cfg, batch);
          } catch (err: any) {
            logServerError(err, `batch start=${start} size=${batch.length}`);
            if (shouldFallback(err)) {
              throw err; // 让外层 catch 翻成 TF-IDF
            }
            // 批量失败 → 单条重试,只丢真正坏的那几条
            console.warn("批量失败,改为单条重试,坏数据会被跳过用零向量占位");
            batchEmbeds = [];
            for (let j = 0; j < batch.length; j++) {
              try {
                const [v] = await callBatch(cfg, [batch[j]]);
                batchEmbeds.push(v);
              } catch (singleErr: any) {
                logServerError(singleErr, `solo idx=${batchOriginalIdx[j]}`);
                console.warn(
                  `   ↳ 跳过 chunk #${batchOriginalIdx[j]}(${batch[j].length} chars):` +
                    `${batch[j].slice(0, 80).replace(/\n/g, " ")}...`,
                );
                batchEmbeds.push(new Array(placeholderDim).fill(0));
              }
            }
          }

          for (let j = 0; j < batchEmbeds.length; j++) {
            embeddings[batchOriginalIdx[j]] = batchEmbeds[j];
          }
        }
        return embeddings;
      } catch (err: any) {
        if (shouldFallback(err)) {
          useRemote = false;
        } else {
          throw err;
        }
      }
    }
  }

  // TF-IDF 后备
  console.log("ℹ️ Using TF-IDF for embeddings (offline mode)");
  return computeTfIdf(texts);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  // 如果向量长度不同(OpenAI vs TF-IDF),填充短的
  const maxLen = Math.max(a.length, b.length);
  const aPadded = [...a, ...new Array(maxLen - a.length).fill(0)];
  const bPadded = [...b, ...new Array(maxLen - b.length).fill(0)];

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < maxLen; i++) {
    dot += aPadded[i] * bPadded[i];
    normA += aPadded[i] * aPadded[i];
    normB += bPadded[i] * bPadded[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
