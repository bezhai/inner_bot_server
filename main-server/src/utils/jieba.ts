import nodejieba from "nodejieba";
import { cloudSkipWords } from "./word-utils";
import _ from "lodash";

/**
 * 检查一个词是否有意义
 * @param word 输入的单词
 * @returns 是否是有意义的单词
 */
function isMeaningful(word: string): boolean {
  for (const char of word) {
    if (/\p{P}/u.test(char) || /\s/.test(char)) {
      return false;
    }
  }
  return true;
}

/**
 * 使用 nodejieba 提取关键词和权重
 * @param text 输入文本
 * @param topN 提取的关键词数量
 * @returns 关键词和对应权重的数组
 */
function extractWithWeight(
  text: string,
  topN: number
): { word: string; weight: number }[] {
  return nodejieba.extract(text, topN).map((item: any) => ({
    word: item.word,
    weight: item.weight,
  }));
}

/**
 * 构建一周的词云
 * @param texts 文本数组
 * @returns 词云结果，Map 对象，其中键是单词，值是累计的权重
 */
export function buildWeeklyWordCloud(texts: string[]): Map<string, number> {
  const result = new Map<string, number>();
  const wordMap = new Set<string>(cloudSkipWords);

  for (const text of texts) {
    // 跳过包含链接的文本
    if (text.includes("https://")) {
      continue;
    }

    // 提取关键词和权重
    const words = extractWithWeight(text, 6);
    const filteredWords: { word: string; weight: number }[] = [];
    let totalWeight = 0;

    for (const word of words) {
      if (wordMap.has(word.word)) {
        continue;
      }
      if (isMeaningful(word.word)) {
        filteredWords.push(word);
        totalWeight += word.weight;
      }
    }

    for (const word of filteredWords) {
      _.update(
        result,
        word.word,
        (oldValue = 0) => oldValue + word.weight / totalWeight
      );
    }
  }

  return result;
}
