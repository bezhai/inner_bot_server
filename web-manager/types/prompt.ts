/**
 * 提示词相关的类型定义
 * 定义了 API 响应和提示词数据结构
 */

export interface Prompt {
  id: string;
  name: string;
  description: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface PromptsResponse {
  success: boolean;
  data: Prompt[];
  message: string;
}

export interface SavePromptResponse {
  success: boolean;
  data?: Prompt;
  message: string;
}
