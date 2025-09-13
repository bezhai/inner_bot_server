import { cloudSkipWords } from './word-utils';
import { dict, idf } from '@node-rs/jieba/dict';
import { Jieba, TfIdf } from '@node-rs/jieba';

const jieba = Jieba.withDict(dict);
const tfidf = TfIdf.withDict(idf);
tfidf.setConfig({
    useHmm: true,
    minKeywordLength: 2,
});

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
    const cloudSkipWordMap = new Set(cloudSkipWords);

    // 将所有文本合并成一个大字符串，使用空格分隔
    const combinedText = texts.join(' ');

    // 对合并后的文本进行TF-IDF关键词提取
    const keywords = extractTagsWithWeight(combinedText, 80);

    // 处理关键词结果
    for (const keyword of keywords) {
        if (cloudSkipWordMap.has(keyword.word)) {
            continue;
        }
        result.set(keyword.word, keyword.weight);
    }

    return result;
}
