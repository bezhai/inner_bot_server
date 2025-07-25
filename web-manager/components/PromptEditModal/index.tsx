/**
 * 提示词编辑对话框组件
 * 提供编辑提示词的表单界面，支持修改名称、描述和内容
 */

import React, { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { X, Save } from 'lucide-react';
import { editingPromptAtom, editModalOpenAtom } from '../../states/promptsState';
import { usePrompts } from '../../hooks/usePrompts';
import { Prompt } from '../../types/prompt';

export const PromptEditModal: React.FC = () => {
  const [editingPrompt, setEditingPrompt] = useAtom(editingPromptAtom);
  const [isOpen, setIsOpen] = useAtom(editModalOpenAtom);
  const { savePrompt, saving } = usePrompts();

  const [formData, setFormData] = useState<Partial<Prompt>>({});

  useEffect(() => {
    if (editingPrompt) {
      setFormData(editingPrompt);
    }
  }, [editingPrompt]);

  const handleClose = () => {
    setIsOpen(false);
    setEditingPrompt(null);
  };

  const handleSave = async () => {
    if (!formData.id || !formData.name || !formData.content) {
      return;
    }

    try {
      await savePrompt({
        ...formData,
        updatedAt: new Date().toISOString(),
      } as Prompt);
      handleClose();
    } catch (error) {
      // 错误已在 hook 中处理
    }
  };

  const handleInputChange = (field: keyof Prompt, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  if (!isOpen || !editingPrompt) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">编辑提示词</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="space-y-6">
            {/* ID（只读） */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ID
              </label>
              <input
                type="text"
                value={formData.id || ''}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500"
              />
            </div>

            {/* 名称 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                名称 *
              </label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="请输入提示词名称"
              />
            </div>

            {/* 描述 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                描述
              </label>
              <input
                type="text"
                value={formData.description || ''}
                onChange={(e) => handleInputChange('description', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="请输入提示词描述"
              />
            </div>

            {/* 内容 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                内容 *
              </label>
              <textarea
                value={formData.content || ''}
                onChange={(e) => handleInputChange('content', e.target.value)}
                rows={12}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                placeholder="请输入提示词内容"
              />
            </div>
          </div>
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !formData.name || !formData.content}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <Save size={16} />
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};
