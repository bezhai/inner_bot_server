/**
 * @file tool-status-service.ts
 * @description 工具状态消息服务，完整迁移自ai-service
 */

/**
 * 工具状态消息服务类
 */
export class ToolStatusService {
    /**
     * 工具状态消息映射，基于实际注册的工具，考虑到赤尾是人类美少女的设定
     */
    private static readonly TOOL_STATUS_MESSAGES: Record<string, string> = {
        // 搜索相关工具
        search_web: '让我来搜搜看~',
        search_doujin_event: '哇！看起来跟同人有关系！让我找找！',
        // 话题总结工具
        topic_summary: '让小尾回忆一下~',
        // Bangumi相关工具
        search_bangumi_subjects: '让小尾查查Bangumi~',
    };

    /**
     * 默认状态消息
     */
    private static readonly DEFAULT_STATUS_MESSAGES: Record<string, string> = {
        thinking: '小尾正在努力思考...🤔',
        replying: '小尾正在努力打字✍️',
        tool_calling: '看我的独家秘技！✨',
    };

    /**
     * 根据工具名称获取状态消息
     */
    static getToolStatusMessage(toolName: string): string {
        return this.TOOL_STATUS_MESSAGES[toolName] || this.DEFAULT_STATUS_MESSAGES.tool_calling;
    }

    /**
     * 获取默认状态消息
     */
    static getDefaultStatusMessage(statusType: string): string {
        return this.DEFAULT_STATUS_MESSAGES[statusType] || this.DEFAULT_STATUS_MESSAGES.thinking;
    }
}
