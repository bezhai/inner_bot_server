import { CommonMessage } from "../../../../models/common-message";
import { CompletionRequest } from "../../../../types/ai";
import { CardManager } from "../../../lark/basic/card-manager";
import { WorkflowEngine, NodeType, BaseContext, WorkflowDefinition } from "../../../workflow";
import { prepareContextMessages, fetchChatConfig } from "./reply-utils";
import { saveRobotMessage } from "../../../message-store/service";
import { generateChatResponse } from "../../ai/chat-service";

// 定义上下文类型
interface ReplyContext extends BaseContext {
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

// 创建工作流引擎
export function createReplyWorkflow() {
  const engine = new WorkflowEngine<ReplyContext>();

  // 注册处理器
  engine.registerHandler('prepareContext', async (context) => {
    // 创建回复卡片
    const cardManager = await CardManager.createReplyCard();
    await cardManager.replyToMessage(context.commonMessage.messageId);

    // 准备上下文消息
    const contextMessages = await prepareContextMessages(context.commonMessage);

    // 获取聊天配置
    const config = await fetchChatConfig(context.commonMessage.chatId);

    // 保存到上下文
    context.cardManager = cardManager;
    context.contextMessages = contextMessages;
    context.config = config;

    // 保存机器人消息
    await saveRobotMessage(
      context.commonMessage,
      cardManager.getMessageId()!,
      cardManager.getCardId()!
    );
  });

  engine.registerHandler('processMessage', async (context) => {
    if (!context.cardManager || !context.contextMessages || !context.config) {
      throw new Error('Context not properly prepared');
    }

    try {
      await generateChatResponse(
        context.config.model,
        context.contextMessages,
        context.cardManager.createActionHandler(),
        context.config.prompt,
        context.config.params,
        context.cardManager.closeUpdate.bind(context.cardManager)
      );
    } catch (error) {
      console.error("回复消息时出错:", error);
      // Error will be handled by closeUpdate through endOfReply callback
    }
  });

  // 定义工作流
  const workflow: WorkflowDefinition<ReplyContext> = {
    id: 'reply-workflow',
    name: 'Reply Workflow',
    nodes: [
      {
        id: 'start',
        type: NodeType.START,
        name: 'Start',
        next: 'prepare-context'
      },
      {
        id: 'prepare-context',
        type: NodeType.REGULAR,
        name: 'Prepare Context',
        handler: 'prepareContext',
        next: 'process-message'
      },
      {
        id: 'process-message',
        type: NodeType.REGULAR,
        name: 'Process Message',
        handler: 'processMessage',
        next: 'end'
      },
      {
        id: 'end',
        type: NodeType.END,
        name: 'End'
      }
    ]
  };

  return { engine, workflow };
}

// 导出新的 makeCardReply 函数
export async function makeCardReply(commonMessage: CommonMessage) {
  const { engine, workflow } = createReplyWorkflow();
  
  await engine.execute({
    ...workflow,
    initialContext: {
      commonMessage
    }
  });
}
