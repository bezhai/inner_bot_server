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
import dayjs from 'dayjs';

/**
 * Action内容适配器
 * 负责将action中的链接引用转换为number_tag格式
 */
export class ActionContentAdapter {
    private refLinkMap = new Map<string, number>();
    private refCounter = 1;
    private readonly refRegex = /[(\（]ref:(https?:\/\/[^\)）]+)[\)）]/g;

    /**
     * 转换内容中的链接引用
     */
    private transformContent(content: string): string {
        return content.replace(this.refRegex, (match, url) => {
            if (!this.refLinkMap.has(url)) {
                this.refLinkMap.set(url, this.refCounter++);
            }
            const number = this.refLinkMap.get(url)!;
            return `<number_tag background_color='grey-50' font_color='grey-600' url='${url}'>${number}</number_tag>`;
        });
    }

    /**
     * 包装原始的action处理器，添加内容转换功能
     */
    public wrapActionHandler(originalHandler: (action: StreamAction) => Promise<void>) {
        return async (action: StreamAction) => {
            const transformedAction = {
                ...action,
                content: this.transformContent(action.content),
            };
            return originalHandler(transformedAction);
        };
    }
}

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
    private createTime: number; // 创建时间, 毫秒时间戳
    private cardContext: Record<string, any> = {}; // 额外数据, 会写到回调里
    private actionContentAdapter: ActionContentAdapter;

    private constructor() {
        this.card = new LarkCard();
        this.createTime = dayjs().valueOf();
        this.actionContentAdapter = new ActionContentAdapter();
    }

    public getCreateTime(): number {
        return this.createTime;
    }

    /**
     * 添加额外数据到卡片上下文
     */
    public appendCardContext(context: Record<string, any>): void {
        this.cardContext = { ...this.cardContext, ...context };
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
            new HrComponent().setElementId(CardManager.ELEMENT_IDS.HR),
            new MarkdownComponent('赤尾思考中...').setElementId(
                CardManager.ELEMENT_IDS.THINKING_PLACEHOLDER,
            ),
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
                card: {
                    type: 'card_json',
                    data: JSON.stringify(this.card),
                },
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
                new CollapsiblePanelHeader('赤尾的内心思考').setBackgroundColor('grey-100'),
            )
                .setElementId(CardManager.ELEMENT_IDS.COLLAPSE)
                .setBorder('grey-100')
                .pushElement(
                    new MarkdownComponent('').setElementId(CardManager.ELEMENT_IDS.REASONING),
                );
            await this.addElements('insert_before', [collapseElement], CardManager.ELEMENT_IDS.HR);
            this.hasReasoningElement = true;
        }
    }

    /**
     * 创建回复内容组件
     */
    private async createResponseElement(): Promise<void> {
        if (!this.hasResponseElement) {
            const mdElement = new MarkdownComponent('').setElementId(
                CardManager.ELEMENT_IDS.RESPONSE,
            );
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
                .getAllElements()
                .findIndex((e: CardElement) => e.getElementId() === targetElementId);
            if (index === -1) {
                throw new Error(`Target element with id ${targetElementId} not found`);
            }

            const insertIndex = type === 'insert_after' ? index + 1 : index;
            this.card.getBody().insertElement(insertIndex, ...elements);
        } else {
            this.card.addElement(...elements);
        }

        console.debug('addElements', JSON.stringify(elements));

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
        const index = body
            .getAllElements()
            .findIndex((e: CardElement) => e.getElementId() === elementId);
        if (index === -1) {
            return;
        }
        body.removeElement(index);
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
        const columnSet = new ColumnSet()
            .setHorizontalSpacing('small')
            .setElementId(CardManager.ELEMENT_IDS.INTERACTION_BUTTONS);

        const thumbsUpColumn = new Column()
            .setElementId(CardManager.ELEMENT_IDS.THUMBS_UP_COLUMN)
            .addElements(
                new InteractiveContainerComponent()
                    .setElementId(CardManager.ELEMENT_IDS.UP_INTERACTIVE)
                    .pushElement(
                        new MarkdownComponent('')
                            .setElementId(CardManager.ELEMENT_IDS.THUMBS_UP_TEXT)
                            .setIcon(new StandardIcon('thumbsup_outlined', 'grey')),
                    )
                    .addCallbackBehavior({
                        type: LarkCardThumbsUp,
                        message_id: this.messageId!,
                        ...this.cardContext,
                    })
                    .setCornerRadius('2px')
                    .setHorizontalAlign('center')
                    .setPadding('0px'),
            )
            .setWidth('30px');

        const thumbsDownColumn = new Column()
            .setElementId(CardManager.ELEMENT_IDS.THUMBS_DOWN_COLUMN)
            .addElements(
                new InteractiveContainerComponent()
                    .setElementId(CardManager.ELEMENT_IDS.DOWN_INTERACTIVE)
                    .pushElement(
                        new MarkdownComponent('')
                            .setElementId(CardManager.ELEMENT_IDS.THUMBS_DOWN_TEXT)
                            .setIcon(new StandardIcon('thumbdown_outlined', 'grey')),
                    )
                    .addCallbackBehavior({
                        type: LarkCardThumbsDown,
                        message_id: this.messageId!,
                        ...this.cardContext,
                    })
                    .setCornerRadius('2px')
                    .setHorizontalAlign('center')
                    .setPadding('0px'),
            )
            .setWidth('30px');

        const retryColumn = new Column()
            .setElementId(CardManager.ELEMENT_IDS.RETRY_COLUMN)
            .addElements(
                new InteractiveContainerComponent()
                    .setElementId(CardManager.ELEMENT_IDS.RETRY_INTERACTIVE)
                    .pushElement(
                        new MarkdownComponent('')
                            .setElementId(CardManager.ELEMENT_IDS.RETRY_TEXT)
                            .setIcon(new StandardIcon('refresh_outlined', 'grey')),
                    )
                    .addCallbackBehavior({
                        type: LarkCardRetry,
                        message_id: this.messageId!,
                        ...this.cardContext,
                    })
                    .setCornerRadius('2px')
                    .setPadding('0px')
                    .setHorizontalAlign('center'),
            )
            .setWidth('30px');

        columnSet.addColumns(thumbsUpColumn, thumbsDownColumn, retryColumn);

        await this.addElements('append', [columnSet]);
    }

    /**
     * 处理错误状态
     */
    private async handleError(): Promise<void> {
        const errorElement = new MarkdownComponent(
            `**<font color='red-500'>赤尾似乎遇到了一些问题，可以重试一下看看！</font>**`,
        ).setElementId(CardManager.ELEMENT_IDS.ERROR_MESSAGE);
        await this.addElements('append', [errorElement]);
    }

    /**
     * 处理成功状态
     */
    private async handleSuccess(fullText: string): Promise<void> {
        const removeThinkText = fullText.replace(/<think>[\s\S]*?<\/think>/g, '');
        await this.updateCardConfig({
            streaming_mode: false,
            summary: {
                content: this.truncate(removeThinkText, 20),
            },
        });
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
        // 使用适配器包装原始处理逻辑
        const originalHandler = async (action: StreamAction) => {
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

        // 返回被适配器包装后的处理器
        return this.actionContentAdapter.wrapActionHandler(originalHandler);
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
        return async (error: Error) => {
            console.error('聊天处理失败:', error);
            await this.handleErrorOnly();
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
        // 实际未创建卡片无需处理
        if (!this.cardId) {
            return;
        }

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
    private async handleErrorOnly(): Promise<void> {
        // 实际未创建卡片无需处理
        if (!this.cardId) {
            return;
        }

        // 移除加载状态
        await this.removeLoadingElements();

        // 处理错误状态
        await this.handleError();

        // 添加交互组件
        await this.addInteractionElements();
    }
}
