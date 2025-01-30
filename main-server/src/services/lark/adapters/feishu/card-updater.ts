import { StreamAction } from "../../../../types/ai";
import { ICardUpdater } from "../../../chat/core/stream/types";
import { updateRobotMessageText } from "../../../message-store/basic";
import { V2card } from "../../../lark/basic/card";
import { 
  CollapsiblePanelComponent, 
  CollapsiblePanelHeader, 
  MarkdownComponent, 
  withElementId 
} from "feishu-card";

export class FeishuCardUpdater implements ICardUpdater {
  private hasReasoningElement: boolean = false;
  private hasResponseElement: boolean = false;

  constructor(
    private v2Card: V2card,
    private reasoningElementId: string = "reasoning_content",
    private responseElementId: string = "response_content"
  ) {}

  /**
   * 创建推理过程组件（插入到最前面）
   */
  private async createReasoningElement(): Promise<void> {
    if (!this.hasReasoningElement) {
      const collapseElement = withElementId(
        new CollapsiblePanelComponent(
          new CollapsiblePanelHeader("赤尾的内心思考").setBackgroundColor("grey-100")
        )
          .setBorder("grey-100")
          .addElement(withElementId(new MarkdownComponent(""), this.reasoningElementId)),
        "collapse"
      );
      // 插入到最前面
      await this.v2Card.addElements("insert_before", [collapseElement], "hr");
      this.hasReasoningElement = true;
    }
  }

  /**
   * 创建回复内容组件（插入到分割线前面）
   */
  private async createResponseElement(): Promise<void> {
    if (!this.hasResponseElement) {
      const mdElement = withElementId(new MarkdownComponent(""), this.responseElementId);
      // 插入到分割线前面
      await this.v2Card.addElements("insert_before", [mdElement], "hr");
      this.hasResponseElement = true;
    }
  }

  async updateThinking(content: string): Promise<void> {
    await this.createReasoningElement();
    await this.v2Card.streamUpdateText(this.reasoningElementId, content);
  }

  async updateContent(content: string): Promise<void> {
    await this.createResponseElement();
    await this.v2Card.streamUpdateText(this.responseElementId, content);
  }

  async closeUpdate(fullText: string | null, error?: Error): Promise<void> {
    await this.v2Card.deleteElement("thinking_placeholder");

    if (error) {
      // Add error message in red
      const errorElement = withElementId(
        new MarkdownComponent(`**<font color='red'>错误: ${error.message}</font>**`),
        "error_message"
      );
      await this.v2Card.addElements("append", [errorElement]);
      return;
    }

    if (fullText) {
      // 移除思维链内容
      const removeThinkText = fullText.replace(/<think>[\s\S]*?<\/think>/g, "");
      await Promise.allSettled([
        this.v2Card.closeUpdate(removeThinkText),
        updateRobotMessageText(this.v2Card.getMessageId()!, removeThinkText),
      ]);
    }
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
