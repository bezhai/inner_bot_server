/**
 * @file web-search-tool.ts
 * @description 网页搜索工具，基于SearchAPI
 */

import axios from 'axios';

/**
 * 答案框结构
 */
export interface AnswerBox {
    snippet?: string;
    answer?: string;
    answer_list?: string[];
}

/**
 * 有机搜索结果
 */
export interface OrganicResult {
    title?: string;
    link?: string;
    snippet?: string;
    snippet_highlighted_words?: string[];
}

/**
 * 知识图谱结果
 */
export interface KnowledgeGraph {
    title?: string;
    type?: string;
    description?: string;
}

/**
 * 网页搜索结果
 */
export interface WebSearchResult {
    answer_box?: AnswerBox;
    organic_results?: OrganicResult[];
    knowledge_graph?: KnowledgeGraph;
}

/**
 * 搜索网页
 */
export async function searchWeb(args: {
    query: string;
    gl?: string;
}): Promise<WebSearchResult> {
    const { query, gl = 'cn' } = args;
    
    const url = 'https://api.302.ai/searchapi/search';
    
    // 从环境变量获取API密钥，如果没有则使用占位符
    const searchApiKey = process.env.SEARCH_API_KEY || 'demo-key';
    
    const params = {
        q: query,
        engine: 'google',
        api_key: searchApiKey,
        hl: 'zh-cn',
        gl,
    };

    try {
        console.info('搜索网页', { query, gl });
        const response = await axios.get(url, {
            params,
            timeout: 15000,
        });

        const data = response.data;
        
        const result: WebSearchResult = {
            answer_box: data.answer_box ? {
                snippet: data.answer_box.snippet,
                answer: data.answer_box.answer,
                answer_list: data.answer_box.answer_list,
            } : undefined,
            organic_results: data.organic_results ? data.organic_results.map((item: any) => ({
                title: item.title,
                link: item.link,
                snippet: item.snippet,
                snippet_highlighted_words: item.snippet_highlighted_words,
            })) : undefined,
            knowledge_graph: data.knowledge_graph ? {
                title: data.knowledge_graph.title,
                type: data.knowledge_graph.type,
                description: data.knowledge_graph.description,
            } : undefined,
        };

        console.info('网页搜索完成', {
            hasAnswerBox: !!result.answer_box,
            organicResultsCount: result.organic_results?.length || 0,
            hasKnowledgeGraph: !!result.knowledge_graph,
        });
        
        return result;
    } catch (error) {
        console.error('网页搜索失败', { error, query });
        throw new Error(`网页搜索失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}