export enum NodeType {
  START = 'START',
  END = 'END',
  REGULAR = 'REGULAR',
  CONDITION = 'CONDITION',
}

export interface NodeConfig {
  id: string;
  type: NodeType;
  name: string;
  next?: string | { [key: string]: string }; // string for regular nodes, object for condition nodes
}

export interface StartNodeConfig extends NodeConfig {
  type: NodeType.START;
  next: string;
}

export interface EndNodeConfig extends NodeConfig {
  type: NodeType.END;
}

export interface RegularNodeConfig extends NodeConfig {
  type: NodeType.REGULAR;
  handler: string; // Name of the function to execute
  next: string;
}

export interface ConditionBranch {
  condition: string; // Name of the condition function
  next: string; // Next node if condition is true
}

export interface ConditionNodeConfig extends NodeConfig {
  type: NodeType.CONDITION;
  branches: ConditionBranch[];
  default: string; // Default path if no conditions match
}

export type WorkflowNode = StartNodeConfig | EndNodeConfig | RegularNodeConfig | ConditionNodeConfig;

export interface WorkflowConfig {
  id: string;
  name: string;
  nodes: WorkflowNode[];
}

// Define base context interface that all contexts must extend
export interface BaseContext {
  [key: string]: unknown;
}

// Handler and condition function types with generic context
export type HandlerFunction<TContext extends BaseContext> = (context: TContext) => Promise<void>;
export type ConditionFunction<TContext extends BaseContext> = (context: TContext) => Promise<boolean>;

// Type-safe handler and condition registries
export type HandlerRegistry<TContext extends BaseContext> = {
  [key: string]: HandlerFunction<TContext>;
};

export type ConditionRegistry<TContext extends BaseContext> = {
  [key: string]: ConditionFunction<TContext>;
};

// Strongly typed workflow configuration
export interface WorkflowDefinition<TContext extends BaseContext> {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  initialContext?: Partial<TContext>;
}

// Example of a strongly typed context
export interface CustomerContext extends BaseContext {
  name: string;
  age: number;
  income: number;
  status: string;
  creditScore?: number;
}
