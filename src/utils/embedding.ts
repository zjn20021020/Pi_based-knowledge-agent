/**
 * Embedding 生成 - 使用多种后端支持
 *
 * 优先级:
 * 1. OpenAI API (需要网络畅通)
 * 2. TF-IDF 文本相似度(离线备选)
 */
import axios from "axios";

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_URL = "https://api.openai.com/v1/embeddings";

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

    // TF
    tokens.forEach((token) => {
      tf.set(token, (tf.get(token) || 0) + 1);
    });

    // TF-IDF
    tf.forEach((freq, word) => {
      const idx = vocabIndex.get(word)!;
      vector[idx] = freq * (idf.get(word) || 0);
    });

    // 归一化
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return norm > 0 ? vector.map((v) => v / norm) : vector;
  });
}

// 尝试 OpenAI API,失败则用 TF-IDF
let useOpenAI = true;

export async function generateEmbedding(text: string): Promise<number[]> {
  const cached = _cache.get(text);
  if (cached) return cached;

  if (useOpenAI) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn("⚠️ OPENAI_API_KEY not set, using TF-IDF fallback");
      useOpenAI = false;
    } else {
      try {
        const response = await axios.post(
          EMBED_URL,
          { model: EMBED_MODEL, input: text.slice(0, 8000) },
          { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 10000 },
        );

        const embedding: number[] = response.data.data[0].embedding;

        if (_cache.size >= CACHE_LIMIT) {
          _cache = new Map();
        }
        _cache.set(text, embedding);

        return embedding;
      } catch (err: any) {
        if (err.code === "ETIMEDOUT" || err.code === "ECONNABORTED") {
          console.warn("⚠️ OpenAI API timeout, switching to TF-IDF fallback");
          useOpenAI = false;
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
  if (useOpenAI) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn("⚠️ OPENAI_API_KEY not set, using TF-IDF fallback");
      useOpenAI = false;
      return computeTfIdf(texts);
    }

    try {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += 100) {
        const batch = texts.slice(i, i + 100).map((t) => t.slice(0, 8000));
        const response = await axios.post(
          EMBED_URL,
          { model: EMBED_MODEL, input: batch },
          { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 30000 },
        );
        out.push(...response.data.data.map((d: { embedding: number[] }) => d.embedding));
      }
      return out;
    } catch (err: any) {
      if (err.code === "ETIMEDOUT" || err.code === "ECONNABORTED") {
        console.warn("⚠️ OpenAI API timeout, switching to TF-IDF fallback");
        useOpenAI = false;
      } else {
        throw err;
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
