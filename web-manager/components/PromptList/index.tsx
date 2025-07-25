/**
 * 提示词列表组件
 * 展示提示词列表，支持编辑功能
 */

import React from 'react';
import { useAtom } from 'jotai';
import { Edit3, FileText, Calendar } from 'lucide-react';
import { editingPromptAtom, editModalOpenAtom } from '../../states/promptsState';
import { Prompt } from '../../types/prompt';

interface PromptListProps {
  prompts: Prompt[];
  loading: boolean;
}

export const PromptList: React.FC<PromptListProps> = ({ prompts, loading }) => {
  const [, setEditingPrompt] = useAtom(editingPromptAtom);
  const [, setEditModalOpen] = useAtom(editModalOpenAtom);

  const handleEdit = (prompt: Prompt) => {
    setEditingPrompt(prompt);
    setEditModalOpen(true);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">加载中...</span>
      </div>
    );
  }

  if (prompts.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText size={48} className="mx-auto text-gray-400 mb-4" />
        <p className="text-gray-500">暂无提示词</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {prompts.map((prompt) => (
        <div
          key={prompt.id}
          className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-lg font-semibold text-gray-900">
                  {prompt.name}
                </h3>
                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                  {prompt.id}
                </span>
              </div>
              
              {prompt.description && (
                <p className="text-gray-600 mb-3">{prompt.description}</p>
              )}
              
              <div className="bg-gray-50 rounded-md p-3 mb-3">
                <p className="text-sm text-gray-700 line-clamp-3">
                  {prompt.content}
                </p>
              </div>
              
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <div className="flex items-center gap-1">
                  <Calendar size={14} />
                  <span>创建：{formatDate(prompt.createdAt)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar size={14} />
                  <span>更新：{formatDate(prompt.updatedAt)}</span>
                </div>
              </div>
            </div>
            
            <button
              onClick={() => handleEdit(prompt)}
              className="ml-4 p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
              title="编辑"
            >
              <Edit3 size={18} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
