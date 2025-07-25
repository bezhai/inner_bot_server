/**
 * 提示词数据管理 Hook
 * 封装了提示词的获取、保存等操作逻辑
 */

import { useAtom } from 'jotai';
import { promptsAtom, loadingAtom, savingAtom } from '../states/promptsState';
import { promptsApi } from '../api/promptsApi';
import toast from 'react-hot-toast';

export const usePrompts = () => {
  const [prompts, setPrompts] = useAtom(promptsAtom);
  const [loading, setLoading] = useAtom(loadingAtom);
  const [saving, setSaving] = useAtom(savingAtom);

  const fetchPrompts = async () => {
    try {
      setLoading(true);
      const data = await promptsApi.getPrompts();
      setPrompts(data);
    } catch (error) {
      toast.error('获取提示词列表失败');
      console.error('Failed to fetch prompts:', error);
    } finally {
      setLoading(false);
    }
  };

  const savePrompt = async (prompt: any) => {
    try {
      setSaving(true);
      const savedPrompt = await promptsApi.savePrompt(prompt);
      
      // 更新本地状态
      setPrompts(prev => {
        const index = prev.findIndex(p => p.id === savedPrompt.id);
        if (index >= 0) {
          const newPrompts = [...prev];
          newPrompts[index] = savedPrompt;
          return newPrompts;
        } else {
          return [...prev, savedPrompt];
        }
      });
      
      toast.success('保存成功');
      return savedPrompt;
    } catch (error) {
      toast.error('保存失败');
      throw error;
    } finally {
      setSaving(false);
    }
  };

  return {
    prompts,
    loading,
    saving,
    fetchPrompts,
    savePrompt,
  };
};
