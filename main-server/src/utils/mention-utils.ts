import { LarkMention } from "../types/lark";

export class MentionUtils {
  static addMentions(mentions: LarkMention[] | undefined): string[] {
    console.log("mentions", mentions);
    return mentions ? mentions.map((m) => m.id.union_id!) : [];
  }
}