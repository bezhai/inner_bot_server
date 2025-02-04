import { 
  BaseContext,
  WorkflowNode, 
  NodeType,
  HandlerRegistry,
  ConditionRegistry,
  StartNodeConfig,
  EndNodeConfig,
  RegularNodeConfig,
  ConditionNodeConfig,
  WorkflowDefinition,
  HandlerFunction,
  ConditionFunction
} from './types';

export class WorkflowEngine<TContext extends BaseContext> {
  private handlers: HandlerRegistry<TContext>;
  private conditions: ConditionRegistry<TContext>;

  constructor() {
    this.handlers = {} as HandlerRegistry<TContext>;
    this.conditions = {} as ConditionRegistry<TContext>;
  }

  public registerHandler(name: string, handler: HandlerFunction<TContext>): void {
    this.handlers[name] = handler;
  }

  public registerCondition(name: string, condition: ConditionFunction<TContext>): void {
    this.conditions[name] = condition;
  }

  private findNode(nodes: WorkflowNode[], nodeId: string): WorkflowNode | undefined {
    return nodes.find(node => node.id === nodeId);
  }

  private async executeRegularNode(
    node: RegularNodeConfig,
    context: TContext
  ): Promise<string> {
    const handler = this.handlers[node.handler];
    if (!handler) {
      throw new Error(`Handler not found: ${node.handler}`);
    }

    await handler(context);
    return node.next;
  }

  private async executeConditionNode(
    node: ConditionNodeConfig,
    context: TContext
  ): Promise<string> {
    for (const branch of node.branches) {
      const condition = this.conditions[branch.condition];
      if (!condition) {
        throw new Error(`Condition not found: ${branch.condition}`);
      }

      const result = await condition(context);
      if (result) {
        return branch.next;
      }
    }

    return node.default;
  }

  private async executeStartNode(
    node: StartNodeConfig,
    _context: TContext
  ): Promise<string> {
    return node.next;
  }

  private async executeEndNode(
    _node: EndNodeConfig,
    _context: TContext
  ): Promise<string> {
    return '';
  }

  public async execute(workflow: WorkflowDefinition<TContext>): Promise<TContext> {
    const context = { ...(workflow.initialContext || {}) } as TContext;
    let currentNodeId = workflow.nodes.find(node => node.type === NodeType.START)?.id;

    if (!currentNodeId) {
      throw new Error('No start node found in workflow');
    }

    while (currentNodeId) {
      const currentNode = this.findNode(workflow.nodes, currentNodeId);
      
      if (!currentNode) {
        throw new Error(`Node not found: ${currentNodeId}`);
      }

      try {
        switch (currentNode.type) {
          case NodeType.START:
            currentNodeId = await this.executeStartNode(currentNode as StartNodeConfig, context);
            break;
          case NodeType.END:
            currentNodeId = await this.executeEndNode(currentNode as EndNodeConfig, context);
            break;
          case NodeType.REGULAR:
            currentNodeId = await this.executeRegularNode(currentNode as RegularNodeConfig, context);
            break;
          case NodeType.CONDITION:
            currentNodeId = await this.executeConditionNode(currentNode as ConditionNodeConfig, context);
            break;
          default:
            throw new Error(`Unknown node type: ${(currentNode as any).type}`);
        }
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Error executing node ${currentNodeId}: ${errorMessage}`);
      }
    }

    return context;
  }
}

// Re-export types for convenience
export type { HandlerFunction, ConditionFunction } from './types';
