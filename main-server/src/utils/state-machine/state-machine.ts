/**
 * 通用状态机实现
 *
 * 这是一个完整的状态机框架，支持：
 * - 状态转换验证
 * - 异步回调管理
 * - 状态栈跟踪
 * - 错误处理和状态回滚
 *
 * 当前项目中 CardManager 使用简化版本的状态管理，
 * 这个完整实现可以作为未来扩展的参考。
 */

/**
 * 通用状态机管理器
 * 支持状态栈、状态转换验证、异步回调管理
 */

export interface StateTransition<TState> {
    from: TState | TState[];
    to: TState;
    allowedFromAny?: boolean;
}

export interface StateHandler<TState, TData> {
    state: TState;
    handler: (data: TData, context: StateMachineContext<TState>) => Promise<void>;
    required?: boolean; // 是否必须等待完成
}

export interface StateMachineContext<TState> {
    currentState: TState | null;
    previousState: TState | null;
    stateStack: TState[];
    metadata: Record<string, any>;
}

export interface StateMachineOptions<TState> {
    initialState?: TState;
    transitions: StateTransition<TState>[];
    allowUnknownTransitions?: boolean;
    onInvalidTransition?: (from: TState | null, to: TState, error: string) => void;
    onStateChange?: (from: TState | null, to: TState, context: StateMachineContext<TState>) => void;
}

export class StateMachine<TState, TData = any> {
    private currentState: TState | null = null;
    private previousState: TState | null = null;
    private stateStack: TState[] = [];
    private metadata: Record<string, any> = {};

    private transitions: Map<string, TState[]> = new Map();
    private handlers: Map<TState, StateHandler<TState, TData>[]> = new Map();
    private pendingHandlers: Map<TState, Promise<void>[]> = new Map();

    // 添加并发控制
    private isTransitioning = false;
    private transitionQueue: Array<{
        to: TState;
        data?: TData;
        resolve: (success: boolean) => void;
        reject: (error: Error) => void;
    }> = [];

    private options: StateMachineOptions<TState>;

    constructor(options: StateMachineOptions<TState>) {
        this.options = options;
        this.currentState = options.initialState || null;

        // 构建转换映射表
        for (const transition of options.transitions) {
            const fromStates = Array.isArray(transition.from) ? transition.from : [transition.from];
            for (const fromState of fromStates) {
                const key = String(fromState);
                if (!this.transitions.has(key)) {
                    this.transitions.set(key, []);
                }
                this.transitions.get(key)!.push(transition.to);
            }

            // 处理 allowedFromAny 的情况
            if (transition.allowedFromAny) {
                const anyKey = '*';
                if (!this.transitions.has(anyKey)) {
                    this.transitions.set(anyKey, []);
                }
                this.transitions.get(anyKey)!.push(transition.to);
            }
        }
    }

    /**
     * 注册状态处理器
     */
    on(
        state: TState,
        handler: (data: TData, context: StateMachineContext<TState>) => Promise<void>,
        required = false,
    ): this {
        if (!this.handlers.has(state)) {
            this.handlers.set(state, []);
        }
        this.handlers.get(state)!.push({ state, handler, required });
        return this;
    }

    /**
     * 验证状态转换是否合法
     */
    private isValidTransition(from: TState | null, to: TState): boolean {
        if (this.options.allowUnknownTransitions) {
            return true;
        }

        // 检查通用转换 (allowedFromAny)
        const anyTransitions = this.transitions.get('*') || [];
        if (anyTransitions.includes(to)) {
            return true;
        }

        // 检查特定转换
        if (from === null) {
            return true; // 初始状态
        }

        const fromKey = String(from);
        const allowedTransitions = this.transitions.get(fromKey) || [];
        return allowedTransitions.includes(to);
    }

    /**
     * 转换状态 - 修复并发控制
     */
    async transition(to: TState, data?: TData): Promise<boolean> {
        return new Promise((resolve, reject) => {
            // 将转换请求加入队列
            this.transitionQueue.push({ to, data, resolve, reject });

            // 如果没有正在进行的转换，开始处理队列
            if (!this.isTransitioning) {
                this.processTransitionQueue();
            }
        });
    }

    /**
     * 处理转换队列
     */
    private async processTransitionQueue(): Promise<void> {
        if (this.isTransitioning || this.transitionQueue.length === 0) {
            return;
        }

        this.isTransitioning = true;

        while (this.transitionQueue.length > 0) {
            const { to, data, resolve, reject } = this.transitionQueue.shift()!;

            try {
                const success = await this.doTransition(to, data);
                resolve(success);
            } catch (error) {
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        }

        this.isTransitioning = false;
    }

    /**
     * 实际执行状态转换
     */
    private async doTransition(to: TState, data?: TData): Promise<boolean> {
        const from = this.currentState;

        // 验证转换
        if (!this.isValidTransition(from, to)) {
            const error = `Invalid transition from ${from} to ${to}`;
            this.options.onInvalidTransition?.(from, to, error);
            return false;
        }

        // 先执行状态处理器，确保当前状态的工作完成
        if (from !== null) {
            await this.waitForState(from);
        }

        // 更新状态
        this.previousState = this.currentState;
        this.currentState = to;
        this.stateStack.push(to);

        // 创建上下文
        const context: StateMachineContext<TState> = {
            currentState: this.currentState,
            previousState: this.previousState,
            stateStack: [...this.stateStack],
            metadata: { ...this.metadata },
        };

        // 触发状态变化回调
        this.options.onStateChange?.(from, to, context);

        // 执行新状态的处理器
        await this.executeHandlers(to, data, context);

        return true;
    }

    /**
     * 执行状态处理器
     */
    private async executeHandlers(
        state: TState,
        data: TData | undefined,
        context: StateMachineContext<TState>,
    ): Promise<void> {
        const handlers = this.handlers.get(state) || [];
        if (handlers.length === 0) {
            return;
        }

        const promises: Promise<void>[] = [];
        const requiredPromises: Promise<void>[] = [];

        for (const { handler, required } of handlers) {
            const promise = handler(data as TData, context).catch((error) => {
                console.error(`Handler for state ${state} failed:`, error);
                throw error;
            });

            promises.push(promise);
            if (required) {
                requiredPromises.push(promise);
            }
        }

        // 等待所有必需的处理器完成
        if (requiredPromises.length > 0) {
            await Promise.all(requiredPromises);
        }

        // 存储所有处理器的 Promise，用于后续状态的等待
        this.pendingHandlers.set(state, promises);
    }

    /**
     * 等待指定状态的所有处理器完成
     */
    async waitForState(state: TState): Promise<void> {
        const promises = this.pendingHandlers.get(state) || [];
        if (promises.length > 0) {
            await Promise.all(promises);
            this.pendingHandlers.delete(state);
        }
    }

    /**
     * 等待所有待处理的状态完成
     */
    async waitForAll(): Promise<void> {
        const allPromises = Array.from(this.pendingHandlers.values()).flat();
        if (allPromises.length > 0) {
            await Promise.all(allPromises);
            this.pendingHandlers.clear();
        }
    }

    /**
     * 获取当前状态
     */
    getCurrentState(): TState | null {
        return this.currentState;
    }

    /**
     * 获取状态栈
     */
    getStateStack(): TState[] {
        return [...this.stateStack];
    }

    /**
     * 获取上下文
     */
    getContext(): StateMachineContext<TState> {
        return {
            currentState: this.currentState,
            previousState: this.previousState,
            stateStack: [...this.stateStack],
            metadata: { ...this.metadata },
        };
    }

    /**
     * 设置元数据
     */
    setMetadata(key: string, value: any): void {
        this.metadata[key] = value;
    }

    /**
     * 获取元数据
     */
    getMetadata(key: string): any {
        return this.metadata[key];
    }

    /**
     * 检查是否正在进行状态转换
     */
    isTransitionInProgress(): boolean {
        return this.isTransitioning;
    }

    /**
     * 获取待处理的转换数量
     */
    getPendingTransitionCount(): number {
        return this.transitionQueue.length;
    }

    /**
     * 重置状态机
     */
    reset(): void {
        this.currentState = this.options.initialState || null;
        this.previousState = null;
        this.stateStack = [];
        this.metadata = {};
        this.pendingHandlers.clear();

        // 清理并发控制状态
        this.isTransitioning = false;
        this.transitionQueue = [];
    }
}
