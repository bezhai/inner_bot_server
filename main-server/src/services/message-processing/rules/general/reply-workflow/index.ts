import { prepareContextHandler } from './handlers/prepare-context';
import { processMessageHandler } from './handlers/process-message';
import { replyWorkflowDefinition } from './workflow-definition';
import { ReplyContext } from './types';
import { CommonMessage } from '../../../../../models/common-message';
import { WorkflowEngine } from '../../../../workflow';

// Create workflow engine instance
const engine = new WorkflowEngine<ReplyContext>();

// Register handlers
engine.registerHandler('prepareContext', prepareContextHandler);
engine.registerHandler('processMessage', processMessageHandler);

// Export makeCardReply function
export async function makeCardReply(commonMessage: CommonMessage) {
  await engine.execute({
    ...replyWorkflowDefinition,
    initialContext: {
      commonMessage,
    },
  });
}

// Export types and handlers for external use if needed
// export * from './types';
// export * from './handlers/prepare-context';
// export * from './handlers/process-message';
// export * from './workflow-definition';
