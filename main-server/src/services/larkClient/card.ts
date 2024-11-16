import { LarkV2Card } from "feishu-card";
import { sendReq, send as basicSend } from "./larkClient";
import { incr } from "../../config/redis";

export class V2card {
  private card: LarkV2Card;
  private cardId?: string;
  private messageId?: string;

  constructor(card: LarkV2Card) {
    this.card = card;
  }

  public static async create(card: LarkV2Card): Promise<V2card> {
    const instance = new V2card(card);
    await instance.createV2Card();
    return instance;
  }

  private async getSequence() {
    return incr(`v2card_${this.cardId}`);
  }

  private async createV2Card() {
    this.cardId = await sendReq<{
      card_id: string;
    }>(
      "/open-apis/cardkit/v1/cards",
      {
        type: "card_json",
        data: JSON.stringify(this.card),
      },
      "POST"
    ).then((res) => {
      return res.card_id;
    });
  }

  async streamUpdateText(elementId: string, content: string): Promise<void> {
    await sendReq(
      `/open-apis/cardkit/v1/cards/${this.cardId}/elements/${elementId}/content`,
      {
        content,
        sequence: await this.getSequence(),
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
    const sendResp = await basicSend(chat_id, realCardJson, "interactive");
    this.messageId = sendResp?.message_id;
  }

  getMessageId() {
    return this.messageId;
  }

  getCardId() {
    return this.cardId;
  }
}
