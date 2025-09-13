import { cloudSkipWords } from './word-utils';
import _ from 'lodash';
import { Jieba, TfIdf } from '@node-rs/jieba';

// 初始化jieba实例
const jieba = new Jieba();
// 初始化TF-IDF实例
const tfidf = new TfIdf();

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
 * 使用 TF-IDF 提取关键词和权重 (对应 jieba.analyse.extract_tags)
 * @param text 原始文本
 * @param topN 返回的关键词数量
 * @returns 带权重的关键词数组
 */
function extractTagsWithWeight(text: string, topN: number): { word: string; weight: number }[] {
    // 使用 TF-IDF 算法提取关键词
    const keywords = tfidf.extractKeywords(jieba, text, topN);

    // 转换格式以匹配现有接口
    return keywords.map((item) => ({
        word: item.keyword,
        weight: item.weight,
    }));
}

/**
 * 构建一周的词云
 * @param texts 文本数组
 * @param batchSize 保留参数以保持兼容性，实际不使用
 * @returns 词云结果，Map 对象，其中键是单词，值是累计的权重
 */
export async function buildWeeklyWordCloud(texts: string[]) {
    const result = new Map<string, number>();
    const wordMap = new Set<string>(cloudSkipWords);

    // 将所有文本合并成一个大字符串，使用空格分隔
    const combinedText = texts.join(' ');

    // 对合并后的文本进行TF-IDF关键词提取
    const keywords = extractTagsWithWeight(combinedText, 80);

    // 处理关键词结果
    for (const keyword of keywords) {
        if (wordMap.has(keyword.word)) {
            continue;
        }
        if (isMeaningful(keyword.word)) {
            result.set(keyword.word, keyword.weight);
        }
    }

    return result;
}
