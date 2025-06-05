import {
    Config,
    StreamConfig,
    Summary,
    CollapsiblePanelComponent,
    CollapsiblePanelHeader,
    MarkdownComponent,
    HrComponent,
    ColumnSet,
    InteractiveContainerComponent,
    Column,
    LarkCard,
    CardElement,
    StandardIcon,
} from 'feishu-card';
import { StreamAction } from 'types/ai';
import { sendReq, reply, send } from '@lark-client';
import { AddElementType, LarkCardRetry, LarkCardThumbsDown, LarkCardThumbsUp } from 'types/lark';
import { v4 as uuidv4 } from 'uuid';
import { CardContextRepository } from 'dal/repositories/repositories';
import { updateRobotMessageText } from 'services/message-store/basic';

/**
 * CardManager 统一管理飞书卡片的全生命周期
 * 包括创建、更新、删除等所有操作
 */
export class CardManager {
    private static readonly ELEMENT_IDS = {
        REASONING: 'reasoning_content',
        RESPONSE: 'response_content',
        THINKING_PLACEHOLDER: 'thinking_placeholder',
        HR: 'hr',
        COLLAPSE: 'collapse',
        INTERACTION_BUTTONS: 'interaction_buttons',
        THUMBS_UP_COLUMN: 'thumbs_up_column',
        THUMBS_DOWN_COLUMN: 'thumbs_down_column',
        RETRY_COLUMN: 'retry_column',
        UP_INTERACTIVE: 'up_interactive',
        DOWN_INTERACTIVE: 'down_interactive',
        RETRY_INTERACTIVE: 'retry_interactive',
        THUMBS_UP_TEXT: 'thumbs_up_text',
        THUMBS_DOWN_TEXT: 'thumbs_down_text',
        RETRY_TEXT: 'retry_text',
        ERROR_MESSAGE: 'error_message',
    } as const;

    private card: LarkCard;
    private cardId?: string;
    private messageId?: string;
    private sequence: number = 0;
    private hasReasoningElement: boolean = false;
    private hasResponseElement: boolean = false;

    private constructor() {
        this.card = new LarkCard();
    }

    /**
     * 初始化一个基础卡片，不包含任何组件
     */
    public static init(): CardManager {
        const instance = new CardManager();
        instance.card.withConfig(
            new Config()
                .withStreamingMode(
                    true,
                    new StreamConfig()
                        .withPrintStrategy('fast')
                        .withPrintFrequency(20)
                        .withPrintStep(4),
                )
                .withSummary(new Summary('少女回复中')),
        );
        return instance;
    }

    /**
     * 添加初始化组件
     */
    private async addInitialElements(): Promise<void> {
        const elements = [
            new HrComponent(CardManager.ELEMENT_IDS.HR),
            new MarkdownComponent(CardManager.ELEMENT_IDS.THINKING_PLACEHOLDER, '赤尾思考中...'),
        ];

        if (this.cardId) {
            // 如果卡片已创建，需要通过API添加元素
            await this.addElements('append', elements);
        } else {
            this.card.addElement(...elements);
        }
    }

    /**
     * 注册回复卡片
     */
    private async registerReply() {
        // 创建卡片实体
        await this.create();
        // 增加初始化组件
        await this.addInitialElements();
    }

    /**
     * @deprecated 创建一个新的回复卡片
     */
    public static async createReplyCard(): Promise<CardManager> {
        // 初始化不带组件的卡片
        const instance = this.init();
        // 创建卡片实体
        await instance.create();
        // 增加初始化组件
        await instance.addInitialElements();
        return instance;
    }

    /**
     * 从消息ID重建卡片
     */
    public static async loadFromMessage(messageId: string): Promise<CardManager | null> {
        const cardContext = await CardContextRepository.findOne({
            where: { message_id: messageId },
        });
        if (!cardContext) {
            return null;
        }

        // 初始化不带组件的卡片
        const instance = this.init();
        instance.cardId = cardContext.card_id;
        instance.messageId = messageId;
        instance.sequence = cardContext.sequence;

        // 全量更新卡片内容
        await instance.update();
        // 增加初始化组件
        await instance.addInitialElements();

        return instance;
    }

    /**
     * 完成卡片创建
     */
    public async complete(): Promise<void> {
        if (!this.cardId) {
            return;
        }
        await this.saveContext();
    }

    /**
     * 获取卡片操作序列号
     */
    private getSequence(): number {
        return ++this.sequence;
    }

    /**
     * 保存卡片上下文到数据库
     */
    private async saveContext(): Promise<void> {
        if (!this.cardId) return;

        try {
            const now = new Date();
            const existingContext = await CardContextRepository.findOne({
                where: { card_id: this.cardId },
            });

            const contextData = {
                card_id: this.cardId,
                message_id: this.messageId || '',
                chat_id: this.messageId?.split('_')[0] || '',
                sequence: this.sequence,
                last_updated: now,
            };

            if (existingContext) {
                // 更新现有记录
                await CardContextRepository.update({ card_id: this.cardId }, contextData);
            } else {
                // 创建新记录
                await CardContextRepository.save({
                    ...contextData,
                    created_at: now,
                });
            }
        } catch (error) {
            console.error('保存上下文失败:', error);
            throw error;
        }
    }

    /**
     * 创建卡片实体
     */
    private async create(): Promise<void> {
        if (this.cardId) {
            throw new Error('Card already exists');
        }

        this.cardId = await sendReq<{
            card_id: string;
        }>(
            '/open-apis/cardkit/v1/cards',
            {
                type: 'card_json',
                data: JSON.stringify(this.card),
                uuid: uuidv4(),
            },
            'POST',
        ).then((res) => res?.card_id);

        await this.saveContext();
    }

    /**
     * 全量更新卡片实体
     */
    private async update(): Promise<void> {
        if (!this.cardId) {
            throw new Error('Card not created yet');
        }

        await sendReq(
            `/open-apis/cardkit/v1/cards/${this.cardId}`,
            {
                type: 'card_json',
                data: JSON.stringify(this.card),
                uuid: uuidv4(),
                sequence: this.getSequence(),
            },
            'PUT',
        );

        await this.saveContext();
    }

    /**
     * 回复消息并完成卡片创建
     */
    public async replyToMessage(messageId: string): Promise<void> {
        if (!this.cardId) {
            throw new Error('Card not created yet');
        }

        const realCardJson = {
            type: 'card',
            data: {
                card_id: this.cardId,
            },
        };
        const sendResp = await reply(messageId, realCardJson, 'interactive');
        this.messageId = sendResp?.message_id;

        // 完成卡片创建
        await this.complete();
    }

    /**
     * 发送到会话并完成卡片创建
     */
    public async sendToChat(chatId: string): Promise<void> {
        if (!this.cardId) {
            throw new Error('Card not created yet');
        }

        const realCardJson = {
            type: 'card',
            data: {
                card_id: this.cardId,
            },
        };
        const sendResp = await send(chatId, realCardJson, 'interactive');
        this.messageId = sendResp?.message_id;

        // 完成卡片创建
        await this.complete();
    }

    /**
     * 创建推理过程组件
     */
    private async createReasoningElement(): Promise<void> {
        if (!this.hasReasoningElement) {
            const collapseElement = new CollapsiblePanelComponent(
                CardManager.ELEMENT_IDS.COLLAPSE,
                new CollapsiblePanelHeader('赤尾的内心思考').setBackgroundColor('grey-100'),
            )
                .setBorder('grey-100')
                .pushElement(new MarkdownComponent(CardManager.ELEMENT_IDS.REASONING, ''));
            await this.addElements('insert_before', [collapseElement], CardManager.ELEMENT_IDS.HR);
            this.hasReasoningElement = true;
        }
    }

    /**
     * 创建回复内容组件
     */
    private async createResponseElement(): Promise<void> {
        if (!this.hasResponseElement) {
            const mdElement = new MarkdownComponent(CardManager.ELEMENT_IDS.RESPONSE, '');
            await this.addElements('insert_before', [mdElement], CardManager.ELEMENT_IDS.HR);
            this.hasResponseElement = true;
        }
    }

    /**
     * 更新推理过程内容
     */
    public async updateThinking(content: string): Promise<void> {
        await this.createReasoningElement();
        await this.streamUpdateText(CardManager.ELEMENT_IDS.REASONING, content);
    }

    /**
     * 更新回复内容
     */
    public async updateContent(content: string): Promise<void> {
        await this.createResponseElement();
        await this.streamUpdateText(CardManager.ELEMENT_IDS.RESPONSE, content);
    }

    /**
     * 流式更新文本内容
     */
    private async streamUpdateText(elementId: string, content: string): Promise<void> {
        await sendReq(
            `/open-apis/cardkit/v1/cards/${this.cardId}/elements/${elementId}/content`,
            {
                content,
                sequence: this.getSequence(),
                uuid: uuidv4(),
            },
            'PUT',
        );
    }

    /**
     * 添加卡片元素
     */
    private async addElements(
        type: AddElementType,
        elements: CardElement[],
        targetElementId?: string,
    ): Promise<void> {
        if (type === 'insert_before' || type === 'insert_after') {
            if (!targetElementId) {
                throw new Error(`targetElementId is required for ${type}`);
            }

            const index = this.card
                .getBody()
                .getAll()
                .findIndex((e: CardElement) => e.element_id === targetElementId);
            if (index === -1) {
                throw new Error(`Target element with id ${targetElementId} not found`);
            }

            const insertIndex = type === 'insert_after' ? index + 1 : index;
            this.card.getBody().insert(insertIndex, ...elements);
        } else {
            this.card.addElement(...elements);
        }

        console.log('addElements', JSON.stringify(elements));

        await sendReq(
            `/open-apis/cardkit/v1/cards/${this.cardId}/elements`,
            {
                type,
                target_element_id: targetElementId,
                elements: JSON.stringify(elements),
                sequence: this.getSequence(),
                uuid: uuidv4(),
            },
            'POST',
        );
    }

    /**
     * 删除卡片元素
     */
    public async deleteElement(elementId: string): Promise<void> {
        const body = this.card.getBody();
        const index = body.getAll().findIndex((e: CardElement) => e.element_id === elementId);
        if (index === -1) {
            return;
        }
        body.remove(index);
        await sendReq(
            `/open-apis/cardkit/v1/cards/${this.cardId}/elements/${elementId}`,
            {
                sequence: this.getSequence(),
                uuid: uuidv4(),
            },
            'DELETE',
        );
    }

    /**
     * 移除加载状态组件
     */
    private async removeLoadingElements(): Promise<void> {
        await this.deleteElement(CardManager.ELEMENT_IDS.THINKING_PLACEHOLDER);
        await this.deleteElement(CardManager.ELEMENT_IDS.HR);
    }

    /**
     * 添加交互组件
     */
    private async addInteractionElements(): Promise<void> {
        const columnSet = new ColumnSet(
            CardManager.ELEMENT_IDS.INTERACTION_BUTTONS,
        ).setHorizontalSpacing('small');

        const thumbsUpColumn = new Column(CardManager.ELEMENT_IDS.THUMBS_UP_COLUMN)
            .addElements(
                new InteractiveContainerComponent(CardManager.ELEMENT_IDS.UP_INTERACTIVE)
                    .pushElement(
                        new MarkdownComponent(CardManager.ELEMENT_IDS.THUMBS_UP_TEXT, '').setIcon(
                            new StandardIcon('thumbsup_outlined', 'grey'),
                        ),
                    )
                    .addCallbackBehavior({
                        type: LarkCardThumbsUp,
                    })
                    .setCornerRadius('2px')
                    .setHorizontalAlign('center')
                    .setPadding('0px'),
            )
            .setWidth('30px');

        const thumbsDownColumn = new Column(CardManager.ELEMENT_IDS.THUMBS_DOWN_COLUMN)
            .addElements(
                new InteractiveContainerComponent(CardManager.ELEMENT_IDS.DOWN_INTERACTIVE)
                    .pushElement(
                        new MarkdownComponent(CardManager.ELEMENT_IDS.THUMBS_DOWN_TEXT, '').setIcon(
                            new StandardIcon('thumbdown_outlined', 'grey'),
                        ),
                    )
                    .addCallbackBehavior({
                        type: LarkCardThumbsDown,
                    })
                    .setCornerRadius('2px')
                    .setHorizontalAlign('center')
                    .setPadding('0px'),
            )
            .setWidth('30px');

        const retryColumn = new Column(CardManager.ELEMENT_IDS.RETRY_COLUMN)
            .addElements(
                new InteractiveContainerComponent(CardManager.ELEMENT_IDS.RETRY_INTERACTIVE)
                    .pushElement(
                        new MarkdownComponent(CardManager.ELEMENT_IDS.RETRY_TEXT, '').setIcon(
                            new StandardIcon('refresh_outlined', 'grey'),
                        ),
                    )
                    .addCallbackBehavior({
                        type: LarkCardRetry,
                    })
                    .setCornerRadius('2px')
                    .setPadding('0px')
                    .setHorizontalAlign('center'),
            )
            .setWidth('30px');

        columnSet.addColumns(thumbsUpColumn, thumbsDownColumn); // TODO: 补充重试逻辑后添加重试按钮

        await this.addElements('append', [columnSet]);
    }

    /**
     * 处理错误状态
     */
    private async handleError(error: Error): Promise<void> {
        const errorElement = new MarkdownComponent(
            CardManager.ELEMENT_IDS.ERROR_MESSAGE,
            `**<font color='red'>错误: ${error.message}</font>**`,
        );
        await this.addElements('append', [errorElement]);
    }

    /**
     * 处理成功状态
     */
    private async handleSuccess(fullText: string): Promise<void> {
        const removeThinkText = fullText.replace(/<think>[\s\S]*?<\/think>/g, '');
        await Promise.all([
            this.updateCardConfig({
                streaming_mode: false,
                summary: {
                    content: this.truncate(removeThinkText, 20),
                },
            }),
            updateRobotMessageText(this.messageId!, removeThinkText),
        ]);
    }

    /**
     * 更新卡片配置
     */
    private async updateCardConfig(config: Partial<LarkCard['config']>): Promise<void> {
        Object.assign(this.card.getConfig()!, config);
        await sendReq(
            `/open-apis/cardkit/v1/cards/${this.cardId}/settings`,
            {
                settings: JSON.stringify({ config: this.card.getConfig() }),
                sequence: this.getSequence(),
                uuid: uuidv4(),
            },
            'PATCH',
        );
    }

    /**
     * 创建动作处理器
     */
    public createActionHandler(): (action: StreamAction) => Promise<void> {
        return async (action) => {
            try {
                // ChatStateMachineManager 已经保证了 onStartReply 完成后才会调用这里
                // 不再需要 isReady 检查
                switch (action.type) {
                    case 'think':
                        if (action.content.length > 0) {
                            await this.updateThinking(action.content);
                        }
                        break;
                    case 'text':
                        if (action.content.length > 0) {
                            await this.updateContent(action.content);
                        }
                        break;
                }
            } catch (error) {
                console.error('处理action时出错:', error);
            }
        };
    }

    private truncate(str: string, max: number): string {
        return str.length > max ? str.slice(0, max) + '...' : str;
    }

    public getMessageId(): string | undefined {
        return this.messageId;
    }

    public getCardId(): string | undefined {
        return this.cardId;
    }

    // ==================== sseChatAdvanced 适配方法 ====================

    /**
     * 消息接收回调 - 对应 onAccept
     */
    public createAcceptHandler(): () => Promise<void> {
        return async () => {
            console.debug('消息已被接收');
            // 这里可以添加消息接收的处理逻辑
        };
    }

    /**
     * 开始回复回调 - 对应 onStartReply
     */
    public createStartReplyHandler(): () => Promise<void> {
        return async () => {
            console.debug('开始注册卡片回复...');
            await this.registerReply();
        };
    }

    /**
     * 回复到消息的回调 - 需要在 onStartReply 之后调用
     */
    public createReplyToMessageHandler(messageId: string): () => Promise<void> {
        return async () => {
            await this.replyToMessage(messageId);
            console.debug('卡片回复注册完成');
        };
    }

    /**
     * 成功完成回调 - 对应 onSuccess
     */
    public createSuccessHandler(): (content: string) => Promise<void> {
        return async (content: string) => {
            console.debug('聊天处理成功');
            await this.handleSuccessOnly(content);
        };
    }

    /**
     * 失败处理回调 - 对应 onFailed
     */
    public createFailedHandler(): (error: Error) => Promise<void> {
        if (!this.cardId) {
            // 实际未创建卡片无需处理
            return async () => {};
        }

        return async (error: Error) => {
            console.error('聊天处理失败:', error);
            await this.handleErrorOnly(error);
        };
    }

    /**
     * 结束回调 - 对应 onEnd
     */
    public createEndHandler(): () => Promise<void> {
        return async () => {
            console.debug('聊天会话结束');
            // 最终完成
            await this.complete();
        };
    }

    /**
     * 一键创建所有高级回调 - 适配 sseChatAdvanced
     */
    public createAdvancedCallbacks(messageId: string) {
        return {
            onAccept: this.createAcceptHandler(),
            onStartReply: async () => {
                await this.createStartReplyHandler()();
                await this.createReplyToMessageHandler(messageId)();
            },
            onSend: this.createActionHandler(),
            onSuccess: this.createSuccessHandler(),
            onFailed: this.createFailedHandler(),
            onEnd: this.createEndHandler(),
        };
    }

    /**
     * 只处理成功状态 - 从 closeUpdate 拆分出来
     */
    private async handleSuccessOnly(fullText: string): Promise<void> {
        // 移除加载状态
        await this.removeLoadingElements();

        // 处理成功状态
        await this.handleSuccess(fullText);

        // 添加交互组件
        await this.addInteractionElements();
    }

    /**
     * 只处理错误状态 - 从 closeUpdate 拆分出来
     */
    private async handleErrorOnly(error: Error): Promise<void> {
        // 移除加载状态
        await this.removeLoadingElements();

        // 处理错误状态
        await this.handleError(error);
    }
}
