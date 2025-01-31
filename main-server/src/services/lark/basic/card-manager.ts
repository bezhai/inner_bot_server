import {
  LarkV2Card,
  Config,
  StreamConfig,
  Summary,
  withElementId,
  CollapsiblePanelComponent,
  CollapsiblePanelHeader,
  MarkdownComponent,
  HrComponent,
  CardElementV2,
} from "feishu-card";
import { StreamAction } from "../../../types/ai";
import { sendReq, reply, send } from "../../../dal/lark-client";
import { AddElementType } from "../../../types/lark";
import { v4 as uuidv4 } from "uuid";
import { incr } from "../../../dal/redis";
import { updateRobotMessageText } from "../../message-store/basic";

/**
 * CardManager 统一管理飞书卡片的全生命周期
 * 包括创建、更新、删除等所有操作
 */
export class CardManager {
  private card: LarkV2Card;
  private cardId?: string;
  private messageId?: string;
  private hasReasoningElement: boolean = false;
  private hasResponseElement: boolean = false;
  private reasoningElementId: string = "reasoning_content";
  private responseElementId: string = "response_content";

  private constructor(card: LarkV2Card) {
    this.card = card;
  }

  /**
   * 创建一个新的回复卡片
   */
  public static async createReplyCard(): Promise<CardManager> {
    const larkCard = new LarkV2Card().withConfig(
      new Config()
        .withStreamingMode(
          true,
          new StreamConfig()
            .withPrintStrategy("fast")
            .withPrintFrequency(20)
            .withPrintStep(4)
        )
        .withSummary(new Summary("少女回复中"))
    );

    larkCard.addElements(
      withElementId(new HrComponent(), "hr"),
      withElementId(
        new MarkdownComponent("赤尾思考中..."),
        "thinking_placeholder"
      )
    );

    const instance = new CardManager(larkCard);
    await instance.create();
    return instance;
  }

  /**
   * 获取卡片操作序列号
   */
  private async getSequence(): Promise<number> {
    return incr(`v2card_${this.cardId}`);
  }

  /**
   * 创建卡片实体
   */
  private async create(): Promise<void> {
    this.cardId = await sendReq<{
      card_id: string;
    }>(
      "/open-apis/cardkit/v1/cards",
      {
        type: "card_json",
        data: JSON.stringify(this.card),
        uuid: uuidv4(),
      },
      "POST"
    ).then((res) => res?.card_id);
  }

  /**
   * 回复消息
   */
  public async replyToMessage(messageId: string): Promise<void> {
    const realCardJson = {
      type: "card",
      data: {
        card_id: this.cardId,
      },
    };
    const sendResp = await reply(messageId, realCardJson, "interactive");
    this.messageId = sendResp?.message_id;
  }

  /**
   * 发送到会话
   */
  public async sendToChat(chatId: string): Promise<void> {
    const realCardJson = {
      type: "card",
      data: {
        card_id: this.cardId,
      },
    };
    const sendResp = await send(chatId, realCardJson, "interactive");
    this.messageId = sendResp?.message_id;
  }

  /**
   * 创建推理过程组件
   */
  private async createReasoningElement(): Promise<void> {
    if (!this.hasReasoningElement) {
      const collapseElement = withElementId(
        new CollapsiblePanelComponent(
          new CollapsiblePanelHeader("赤尾的内心思考").setBackgroundColor(
            "grey-100"
          )
        )
          .setBorder("grey-100")
          .addElement(
            withElementId(new MarkdownComponent(""), this.reasoningElementId)
          ),
        "collapse"
      );
      await this.addElements("insert_before", [collapseElement], "hr");
      this.hasReasoningElement = true;
    }
  }

  /**
   * 创建回复内容组件
   */
  private async createResponseElement(): Promise<void> {
    if (!this.hasResponseElement) {
      const mdElement = withElementId(
        new MarkdownComponent(""),
        this.responseElementId
      );
      await this.addElements("insert_before", [mdElement], "hr");
      this.hasResponseElement = true;
    }
  }

  /**
   * 更新推理过程内容
   */
  public async updateThinking(content: string): Promise<void> {
    await this.createReasoningElement();
    await this.streamUpdateText(this.reasoningElementId, content);
  }

  /**
   * 更新回复内容
   */
  public async updateContent(content: string): Promise<void> {
    await this.createResponseElement();
    await this.streamUpdateText(this.responseElementId, content);
  }

  /**
   * 流式更新文本内容
   */
  private async streamUpdateText(
    elementId: string,
    content: string
  ): Promise<void> {
    await sendReq(
      `/open-apis/cardkit/v1/cards/${this.cardId}/elements/${elementId}/content`,
      {
        content,
        sequence: await this.getSequence(),
        uuid: uuidv4(),
      },
      "PUT"
    );
  }

  /**
   * 添加卡片元素
   */
  private async addElements(
    type: AddElementType,
    elements: CardElementV2[],
    targetElementId?: string
  ): Promise<void> {
    if (type === "insert_before" || type === "insert_after") {
      if (!targetElementId) {
        throw new Error(`targetElementId is required for ${type}`);
      }

      const index = this.card.body.elements.findIndex(
        (e: CardElementV2) => e.element_id === targetElementId
      );
      if (index === -1) {
        throw new Error(`Target element with id ${targetElementId} not found`);
      }

      const insertIndex = type === "insert_after" ? index + 1 : index;
      this.card.body.elements.splice(insertIndex, 0, ...elements);
    } else {
      this.card.body.elements.push(...elements);
    }

    await sendReq(
      `/open-apis/cardkit/v1/cards/${this.cardId}/elements`,
      {
        type,
        target_element_id: targetElementId,
        elements: JSON.stringify(elements),
        sequence: await this.getSequence(),
        uuid: uuidv4(),
      },
      "POST"
    );
  }

  /**
   * 删除卡片元素
   */
  public async deleteElement(elementId: string): Promise<void> {
    this.card.body.elements = this.card.body.elements.filter(
      (e: CardElementV2) => e.element_id !== elementId
    );
    await sendReq(
      `/open-apis/cardkit/v1/cards/${this.cardId}/elements/${elementId}`,
      {
        sequence: await this.getSequence(),
        uuid: uuidv4(),
      },
      "DELETE"
    );
  }

  /**
   * 完成卡片更新
   */
  public async closeUpdate(
    fullText: string | null,
    error?: Error
  ): Promise<void> {
    await this.deleteElement("thinking_placeholder");

    if (error) {
      const errorElement = withElementId(
        new MarkdownComponent(
          `**<font color='red'>错误: ${error.message}</font>**`
        ),
        "error_message"
      );
      await this.addElements("append", [errorElement]);
      return;
    }

    if (fullText) {
      const removeThinkText = fullText.replace(/<think>[\s\S]*?<\/think>/g, "");
      await Promise.allSettled([
        this.updateCardConfig({
          streaming_mode: false,
          summary: {
            content: this.truncate(removeThinkText, 20),
          },
        }),
        updateRobotMessageText(this.messageId!, removeThinkText),
      ]);
    }
  }

  /**
   * 更新卡片配置
   */
  private async updateCardConfig(
    config: Partial<LarkV2Card["config"]>
  ): Promise<void> {
    Object.assign(this.card.config!, config);
    await sendReq(
      `/open-apis/cardkit/v1/cards/${this.cardId}/settings`,
      {
        settings: JSON.stringify({ config: this.card.config }),
        sequence: await this.getSequence(),
        uuid: uuidv4(),
      },
      "PATCH"
    );
  }

  /**
   * 创建动作处理器
   */
  public createActionHandler(): (action: StreamAction) => Promise<void> {
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

  private truncate(str: string, max: number): string {
    return str.length > max ? str.slice(0, max) + "..." : str;
  }

  public getMessageId(): string | undefined {
    return this.messageId;
  }

  public getCardId(): string | undefined {
    return this.cardId;
  }
}
