import { CommonMessage } from '../../../../../models/common-message';
import { CompletionRequest } from '../../../../../types/ai';
import { CardManager } from '../../../../lark/basic/card-manager';
import { BaseContext } from '../../../../workflow';

// 定义上下文类型
export interface ReplyContext extends BaseContext {
  // 输入
  commonMessage: CommonMessage;

  // 中间状态
  cardManager?: CardManager;
  contextMessages?: CommonMessage[];
  config?: {
    model: string;
    prompt: string;
    params: Partial<CompletionRequest>;
  };
}
