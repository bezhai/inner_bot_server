export class TextUtils {
  static clearText(text: string): string {
    return text
      .replace(/@_user_\d+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  static removeEmoji(text: string): string {
    return text.replace(/\[[^\]]+\]/g, '').replace(/<[^<>]+>/g, '');
  }
}
