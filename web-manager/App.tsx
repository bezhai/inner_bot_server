/**
 * 主应用组件
 * 整合提示词列表和编辑功能，提供完整的提示词管理界面
 */

import React, { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { FileText, RefreshCw, Plus } from 'lucide-react';
import { PromptList } from './components/PromptList';
import { PromptEditModal } from './components/PromptEditModal';
import { usePrompts } from './hooks/usePrompts';
import { editingPromptAtom, editModalOpenAtom } from './states/promptsState';
import { useAtom } from 'jotai';

const App: React.FC = () => {
  const { prompts, loading, fetchPrompts } = usePrompts();
  const [, setEditingPrompt] = useAtom(editingPromptAtom);
  const [, setEditModalOpen] = useAtom(editModalOpenAtom);

  useEffect(() => {
    fetchPrompts();
  }, []);

  const handleNewPrompt = () => {
    setEditingPrompt({
      id: '',
      name: '',
      description: '',
      content: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setEditModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" />
      
      {/* 头部 */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText size={28} className="text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">
                AI 提示词管理
              </h1>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={handleNewPrompt}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                <Plus size={16} />
                新建提示词
              </button>
              <button
                onClick={fetchPrompts}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                刷新
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 主内容 */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <PromptList prompts={prompts} loading={loading} />
      </div>

      {/* 编辑对话框 */}
      <PromptEditModal />
    </div>
  );
};

export default App;
