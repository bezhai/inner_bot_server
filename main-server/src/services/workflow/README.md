# Workflow Engine

A simple yet powerful workflow engine that supports various types of nodes and async operations.

## Features

- Start and End nodes
- Regular nodes with custom function execution
- Multi-branch Condition nodes with independent conditions
- Context passing between nodes
- Async/await support
- Error handling

## Node Types

1. **Start Node**: Entry point of the workflow
2. **End Node**: Exit point of the workflow
3. **Regular Node**: Executes a custom function with the workflow context
4. **Condition Node**: Evaluates multiple independent branches, each with its own condition

## Usage

### 1. Create a Workflow Engine Instance

```typescript
import { WorkflowEngine } from './engine';
const engine = new WorkflowEngine();
```

### 2. Register Handlers and Conditions

```typescript
// Register function handlers
engine.registerHandler('handlerName', async (context) => {
  // Your function logic here
  context.someValue = 'result';
});

// Register condition functions
engine.registerCondition('conditionName', async (context) => {
  // Your condition logic here
  return context.someValue === 'expected';
});
```

### 3. Define Workflow Configuration

```typescript
import { NodeType, WorkflowConfig } from './types';

const workflow: WorkflowConfig = {
  id: 'workflow-id',
  name: 'Workflow Name',
  nodes: [
    {
      id: 'start',
      type: NodeType.START,
      name: 'Start',
      next: 'next-node-id'
    },
    {
      id: 'regular-node',
      type: NodeType.REGULAR,
      name: 'Regular Node',
      handler: 'handlerName',
      next: 'next-node-id'
    },
    {
      id: 'condition-node',
      type: NodeType.CONDITION,
      name: 'Multiple Branch Node',
      branches: [
        {
          condition: 'isPremiumCustomer',
          next: 'premium-path'
        },
        {
          condition: 'isPreferredCustomer',
          next: 'preferred-path'
        },
        {
          condition: 'isRegularCustomer',
          next: 'regular-path'
        }
      ],
      default: 'basic-path' // Default path if no conditions match
    },
    {
      id: 'end',
      type: NodeType.END,
      name: 'End'
    }
  ]
};
```

### 4. Execute Workflow

```typescript
try {
  const finalContext = await engine.execute(workflow, {
    // Initial context
    key: 'value'
  });
  console.log('Workflow completed:', finalContext);
} catch (error) {
  console.error('Workflow failed:', error);
}
```

## Multi-Branch Conditions

The condition node supports multiple independent branches:

- Each branch has its own condition function
- Conditions are evaluated in order
- First matching condition determines the next node
- Default path is taken if no conditions match
- Allows for complex decision trees with multiple paths
- Each condition can have its own unique logic

## Error Handling

The workflow engine provides comprehensive error handling:
- Validates node configurations
- Checks for missing handlers/conditions
- Ensures proper node connections
- Wraps execution errors with node context

## Example

See `example.ts` for a complete working example of the workflow engine in action. The example demonstrates a customer classification workflow with multiple independent branches based on different criteria (premium, preferred, regular, and basic customer types).
