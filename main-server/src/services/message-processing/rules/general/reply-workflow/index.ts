import { prepareContextHandler } from './handlers/prepare-context';
import { processMessageHandler } from './handlers/process-message';
import { replyWorkflowDefinition } from './workflow-definition';
import { ReplyContext } from './types';
import { Message } from '../../../../../models/message';
import { WorkflowEngine } from '../../../../workflow';

// Create workflow engine instance
const engine = new WorkflowEngine<ReplyContext>();

// Register handlers
engine.registerHandler('prepareContext', prepareContextHandler);
engine.registerHandler('processMessage', processMessageHandler);

// Export makeCardReply function
export async function makeCardReply(message: Message) {
    await engine.execute({
        ...replyWorkflowDefinition,
        initialContext: {
            message,
        },
    });
}
