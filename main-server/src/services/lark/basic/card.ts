import { CardElementV2, LarkV2Card } from "feishu-card";
import { incr } from "../../../dal/redis";
import { sendReq, reply, send } from "../../../dal/lark-client";
import { AddElementType } from "../../../types/lark";
import { v4 as uuidv4 } from 'uuid';

/**
 * V2card 类用于处理飞书卡片消息的创建、发送和更新
 * 提供了完整的卡片生命周期管理，包括：
 * - 创建和发送卡片
 * - 更新卡片内容和配置
 * - 管理卡片元素（添加、更新、删除）
 */
export class V2card {
  private card: LarkV2Card;
  private cardId?: string;
  private messageId?: string;

  /**
   * 构造函数
   * @param card 飞书卡片配置对象
   */
  constructor(card: LarkV2Card) {
    this.card = card;
  }

  public static async create(card: LarkV2Card): Promise<V2card> {
    const instance = new V2card(card);
    await instance.createV2Card();
    return instance;
  }

  /**
   * 获取卡片操作序列号，用于确保更新操作的顺序性
   */
  private async getSequence() {
    return incr(`v2card_${this.cardId}`);
  }

  /** 
   * 创建卡片实体
   * 通过API创建卡片并获取卡片ID
   */
  private async createV2Card() {
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
    ).then((res) => {
      return res?.card_id;
    });
  }

  /**
   * 流式更新卡片元素的文本内容
   */
  async streamUpdateText(elementId: string, content: string): Promise<void> {
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

  async send(chat_id: string) {
    const realCardJson = {
      type: "card",
      data: {
        card_id: this.cardId,
      },
    };
    const sendResp = await send(chat_id, realCardJson, "interactive");
    this.messageId = sendResp?.message_id;
  }

  async reply(messageId: string) {
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
   * 更新卡片配置
   * @param config 要更新的配置对象
   */
  private async updateCardConfig(config: Partial<LarkV2Card["config"]>) {
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
   * 完整更新卡片内容
   * @param card 新的卡片配置
   */
  async fullUpdateCard(card: Partial<LarkV2Card>) {
    // 更新本地card对象
    Object.assign(this.card, card);
    await sendReq(
      `/open-apis/cardkit/v1/cards/${this.cardId}`,
      {
        card: {
          type: "card_json",
          data: JSON.stringify(this.card),
        },
        sequence: await this.getSequence(),
        uuid: uuidv4(),
      },
      "PUT"
    );
  }

  /**
   * 判断元素是否为容器组件
   * 目前只判断是否包含elements字段
   * TODO: 后续需要支持columns字段的情况
   */
  private isContainerElement(element: CardElementV2): boolean {
    return 'elements' in element;
  }

  /**
   * 添加卡片元素
   * @param type 添加类型
   *   - insert_before：在目标组件前插入
   *   - insert_after：在目标组件后插入
   *   - append：在卡片或容器组件末尾添加
   * @param elements 要添加的元素数组
   * @param targetElementId 目标元素ID
   *   - 当type为insert_before或insert_after时，必须提供有效的目标组件ID
   *   - 当type为append时，如果提供ID则必须是容器组件，否则默认添加到卡片body末尾
   */
  async addElements(
    type: AddElementType,
    elements: CardElementV2[],
    targetElementId?: string
  ) {
    // 更新本地card对象中的elements
    if (type === 'insert_before' || type === 'insert_after') {
      if (!targetElementId) {
        throw new Error(`targetElementId is required for ${type}`);
      }

      // TODO: 后续需要考察容器组件是否也支持
      const index = this.card.body.elements.findIndex((e: CardElementV2) => e.element_id === targetElementId);
      if (index === -1) {
        throw new Error(`Target element with id ${targetElementId} not found`);
      }

      // insert_after需要在找到的索引后插入
      const insertIndex = type === 'insert_after' ? index + 1 : index;
      this.card.body.elements.splice(insertIndex, 0, ...elements);
    } else if (type === 'append' && targetElementId) {
      // 如果指定了targetElementId，需要验证是否为容器组件
      const targetElement = this.card.body.elements.find((e: CardElementV2) => e.element_id === targetElementId);
      if (!targetElement) {
        throw new Error(`Target element with id ${targetElementId} not found`);
      }
      if (!this.isContainerElement(targetElement)) {
        throw new Error(`Target element with id ${targetElementId} is not a container component`);
      }
      // 将elements添加到容器组件的elements数组中
      (targetElement as any).elements.push(...elements);
    } else {
      // 默认添加到卡片body末尾
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
   * 更新卡片元素
   * @param element 更新后的元素配置
   */
  async updateElement(element: CardElementV2) {
    // 更新本地card对象中的element
    const index = this.card.body.elements.findIndex((e: CardElementV2) => e.element_id === element.element_id);
    if (index === -1) {
      throw new Error(`Element with id ${element.element_id} not found`);
    }
    // Create a new element with the updated properties
    const updatedElement = {
      ...this.card.body.elements[index],
      ...element
    };
    this.card.body.elements[index] = updatedElement as CardElementV2;
    await sendReq(
      `/open-apis/cardkit/v1/cards/${this.cardId}/elements/${element.element_id}`,
      {
        element: JSON.stringify(element),
        sequence: await this.getSequence(),
        uuid: uuidv4(),
      },
      "PUT"
    );
  }

  /**
   * 部分更新卡片元素
   * @param elementId 元素ID
   * @param partialElement 部分更新的元素配置
   */
  async updatePartialElement(
    elementId: string,
    partialElement: Omit<Partial<CardElementV2>, "tag">
  ) {
    // 更新本地card对象中的element
    const index = this.card.body.elements.findIndex((e: CardElementV2) => e.element_id === elementId);
    if (index === -1) {
      throw new Error(`Element with id ${elementId} not found`);
    }
    const updatedElement = {
      ...this.card.body.elements[index],
      ...partialElement
    };
    this.card.body.elements[index] = updatedElement as CardElementV2;
    await sendReq(
      `/open-apis/cardkit/v1/cards/${this.cardId}/elements/${elementId}`,
      {
        partial_element: JSON.stringify(partialElement),
        sequence: await this.getSequence(),
        uuid: uuidv4(),
      },
      "PUT"
    );
  }

  /**
   * 删除卡片元素
   * @param elementId 要删除的元素ID
   */
  async deleteElement(elementId: string) {
    // 更新本地card对象，移除被删除的element
    this.card.body.elements = this.card.body.elements.filter((e: CardElementV2) => e.element_id !== elementId);
    await sendReq(
      `/open-apis/cardkit/v1/cards/${this.cardId}/elements/${elementId}`,
      {
        sequence: await this.getSequence(),
        uuid: uuidv4(),
      },
      "DELETE"
    );
  }

  async closeUpdate(fullText: string) {
    const truncate = (str: string, max: number) =>
      str.length > max ? str.slice(0, max) + "..." : str;
    await this.updateCardConfig({
      streaming_mode: false,
      summary: {
        content: truncate(fullText, 20),
      },
    });
  }

  getMessageId() {
    return this.messageId;
  }

  getCardId() {
    return this.cardId;
  }
}
