import { LarkMention } from '../types/lark';

export class MentionUtils {
    static addMentions(mentions: LarkMention[] | undefined): string[] {
        return mentions ? mentions.map((m) => m.id.union_id!) : [];
    }
}
