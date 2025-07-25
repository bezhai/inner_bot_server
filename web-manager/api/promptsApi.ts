/**
 * 提示词 API 请求封装
 * 封装了获取列表和保存提示词的 API 调用
 */

import { Prompt, PromptsResponse, SavePromptResponse } from '../types/prompt';

const BASE_URL = '/api/prompts';

export const promptsApi = {
  // 获取提示词列表
  async getPrompts(): Promise<Prompt[]> {
    try {
      const response = await fetch(BASE_URL);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: PromptsResponse = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch prompts');
      }
      
      return data.data;
    } catch (error) {
      console.error('Error fetching prompts:', error);
      throw error;
    }
  },

  // 保存提示词
  async savePrompt(prompt: Prompt): Promise<Prompt> {
    try {
      const response = await fetch(BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(prompt),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: SavePromptResponse = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to save prompt');
      }
      
      return data.data || prompt;
    } catch (error) {
      console.error('Error saving prompt:', error);
      throw error;
    }
  },
};
