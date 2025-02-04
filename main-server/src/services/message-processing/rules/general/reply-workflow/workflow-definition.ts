import { WorkflowDefinition, NodeType } from '../../../../workflow';
import { ReplyContext } from './types';

export const replyWorkflowDefinition: WorkflowDefinition<ReplyContext> = {
  id: 'reply-workflow',
  name: 'Reply Workflow',
  nodes: [
    {
      id: 'start',
      type: NodeType.START,
      name: 'Start',
      next: 'prepare-context',
    },
    {
      id: 'prepare-context',
      type: NodeType.REGULAR,
      name: 'Prepare Context',
      handler: 'prepareContext',
      next: 'process-message',
    },
    {
      id: 'process-message',
      type: NodeType.REGULAR,
      name: 'Process Message',
      handler: 'processMessage',
      next: 'end',
    },
    {
      id: 'end',
      type: NodeType.END,
      name: 'End',
    },
  ],
};
