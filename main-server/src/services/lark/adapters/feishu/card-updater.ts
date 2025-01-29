import { StreamAction } from "../../../../types/ai";
import { ICardUpdater } from "../../../chat/core/stream/types";
import { updateRobotMessageText } from "../../../message-store/basic";
import { V2card } from "../../../lark/basic/card";

export class FeishuCardUpdater implements ICardUpdater {
  constructor(
    private v2Card: V2card,
    private thinkingElementId: string = "reason_md",
    private contentElementId: string = "md"
  ) {}

  async updateThinking(content: string): Promise<void> {
    await this.v2Card.streamUpdateText(this.thinkingElementId, content);
  }

  async updateContent(content: string): Promise<void> {
    await this.v2Card.streamUpdateText(this.contentElementId, content);
  }

  async closeUpdate(fullText: string): Promise<void> {
    // 移除思维链内容
    const removeThinkText = fullText.replace(/<think>[\s\S]*?<\/think>/g, "");

    await Promise.allSettled([
      this.v2Card.closeUpdate(removeThinkText),
      updateRobotMessageText(this.v2Card.getMessageId()!, removeThinkText),
    ]);
  }

  // 工厂方法：从action创建action handler
  createActionHandler(): (action: StreamAction) => Promise<void> {
    return async (action) => {
      try {
        switch (action.type) {
          case "think":
            if (action.content.length > 0) {
              await this.updateThinking(action.content);
            }
            break;
          case "text":
            if (action.content.length > 0) {
              await this.updateContent(action.content);
            }
            break;
          case "function_call":
            // Handle function calls if needed
            break;
        }
      } catch (error) {
        console.error("处理action时出错:", error);
      }
    };
  }
}
