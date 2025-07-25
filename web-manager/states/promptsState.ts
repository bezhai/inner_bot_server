/**
 * 提示词全局状态管理
 * 使用 jotai 管理提示词列表、加载状态、编辑状态等
 */

import { atom } from 'jotai';
import { Prompt } from '../types/prompt';

// 提示词列表状态
export const promptsAtom = atom<Prompt[]>([]);

// 加载状态
export const loadingAtom = atom<boolean>(false);

// 保存状态
export const savingAtom = atom<boolean>(false);

// 当前编辑的提示词
export const editingPromptAtom = atom<Prompt | null>(null);

// 编辑对话框显示状态
export const editModalOpenAtom = atom<boolean>(false);
