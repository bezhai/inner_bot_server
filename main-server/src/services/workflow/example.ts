import { WorkflowEngine } from './engine';
import { NodeType, CustomerContext, WorkflowDefinition } from './types';

async function example() {
    // Create a new workflow engine with CustomerContext type
    const engine = new WorkflowEngine<CustomerContext>();

    // Register handlers with proper typing
    engine.registerHandler('logName', async (context: CustomerContext) => {
        console.log(`Hello, ${context.name}!`);
    });

    engine.registerHandler('setAge', async (context: CustomerContext) => {
        context.age = 25;
    });

    engine.registerHandler('setIncome', async (context: CustomerContext) => {
        context.income = 50000;
    });

    engine.registerHandler('setPremiumStatus', async (context: CustomerContext) => {
        context.status = 'Premium Customer';
        console.log('Status set to: Premium Customer');
    });

    engine.registerHandler('setPreferredStatus', async (context: CustomerContext) => {
        context.status = 'Preferred Customer';
        console.log('Status set to: Preferred Customer');
    });

    engine.registerHandler('setRegularStatus', async (context: CustomerContext) => {
        context.status = 'Regular Customer';
        console.log('Status set to: Regular Customer');
    });

    engine.registerHandler('setBasicStatus', async (context: CustomerContext) => {
        context.status = 'Basic Customer';
        console.log('Status set to: Basic Customer');
    });

    // Register conditions with proper typing
    engine.registerCondition('isPremiumCustomer', async (context: CustomerContext) => {
        return context.age >= 18 && context.income >= 100000;
    });

    engine.registerCondition('isPreferredCustomer', async (context: CustomerContext) => {
        return context.age >= 18 && context.income >= 50000;
    });

    engine.registerCondition('isRegularCustomer', async (context: CustomerContext) => {
        return context.age >= 18;
    });

    // Define workflow with proper typing
    const workflow: WorkflowDefinition<CustomerContext> = {
        id: 'customer-classification-workflow',
        name: 'Customer Classification Workflow',
        nodes: [
            {
                id: 'start',
                type: NodeType.START,
                name: 'Start',
                next: 'log-name',
            },
            {
                id: 'log-name',
                type: NodeType.REGULAR,
                name: 'Log Name',
                handler: 'logName',
                next: 'set-age',
            },
            {
                id: 'set-age',
                type: NodeType.REGULAR,
                name: 'Set Age',
                handler: 'setAge',
                next: 'set-income',
            },
            {
                id: 'set-income',
                type: NodeType.REGULAR,
                name: 'Set Income',
                handler: 'setIncome',
                next: 'check-customer-type',
            },
            {
                id: 'check-customer-type',
                type: NodeType.CONDITION,
                name: 'Check Customer Type',
                branches: [
                    {
                        condition: 'isPremiumCustomer',
                        next: 'set-premium-status',
                    },
                    {
                        condition: 'isPreferredCustomer',
                        next: 'set-preferred-status',
                    },
                    {
                        condition: 'isRegularCustomer',
                        next: 'set-regular-status',
                    },
                ],
                default: 'set-basic-status',
            },
            {
                id: 'set-premium-status',
                type: NodeType.REGULAR,
                name: 'Set Premium Status',
                handler: 'setPremiumStatus',
                next: 'end',
            },
            {
                id: 'set-preferred-status',
                type: NodeType.REGULAR,
                name: 'Set Preferred Status',
                handler: 'setPreferredStatus',
                next: 'end',
            },
            {
                id: 'set-regular-status',
                type: NodeType.REGULAR,
                name: 'Set Regular Status',
                handler: 'setRegularStatus',
                next: 'end',
            },
            {
                id: 'set-basic-status',
                type: NodeType.REGULAR,
                name: 'Set Basic Status',
                handler: 'setBasicStatus',
                next: 'end',
            },
            {
                id: 'end',
                type: NodeType.END,
                name: 'End',
            },
        ],
        initialContext: {
            name: 'John Doe',
            age: 0,
            income: 0,
            status: 'Unknown',
        },
    };

    try {
        // Execute workflow with type-safe context
        const finalContext = await engine.execute(workflow);
        console.log('Workflow completed. Final context:', finalContext);
    } catch (error) {
        console.error('Workflow execution failed:', error);
    }
}

// Export the example workflow for use in the main application
const createCustomerWorkflow = () => {
    const engine = new WorkflowEngine<CustomerContext>();

    // Register all handlers and conditions
    registerHandlersAndConditions(engine);

    // Return the workflow definition
    return {
        engine,
        workflow,
    };
};

// Helper function to register all handlers and conditions
function registerHandlersAndConditions(engine: WorkflowEngine<CustomerContext>) {
    // Register handlers
    engine.registerHandler('logName', async (context: CustomerContext) => {
        console.log(`Hello, ${context.name}!`);
    });

    engine.registerHandler('setAge', async (context: CustomerContext) => {
        context.age = 25;
    });

    engine.registerHandler('setIncome', async (context: CustomerContext) => {
        context.income = 50000;
    });

    engine.registerHandler('setPremiumStatus', async (context: CustomerContext) => {
        context.status = 'Premium Customer';
        console.log('Status set to: Premium Customer');
    });

    engine.registerHandler('setPreferredStatus', async (context: CustomerContext) => {
        context.status = 'Preferred Customer';
        console.log('Status set to: Preferred Customer');
    });

    engine.registerHandler('setRegularStatus', async (context: CustomerContext) => {
        context.status = 'Regular Customer';
        console.log('Status set to: Regular Customer');
    });

    engine.registerHandler('setBasicStatus', async (context: CustomerContext) => {
        context.status = 'Basic Customer';
        console.log('Status set to: Basic Customer');
    });

    // Register conditions
    engine.registerCondition('isPremiumCustomer', async (context: CustomerContext) => {
        return context.age >= 18 && context.income >= 100000;
    });

    engine.registerCondition('isPreferredCustomer', async (context: CustomerContext) => {
        return context.age >= 18 && context.income >= 50000;
    });

    engine.registerCondition('isRegularCustomer', async (context: CustomerContext) => {
        return context.age >= 18;
    });
}

// Example workflow definition
const workflow: WorkflowDefinition<CustomerContext> = {
    id: 'customer-classification-workflow',
    name: 'Customer Classification Workflow',
    nodes: [
        {
            id: 'start',
            type: NodeType.START,
            name: 'Start',
            next: 'log-name',
        },
        {
            id: 'log-name',
            type: NodeType.REGULAR,
            name: 'Log Name',
            handler: 'logName',
            next: 'set-age',
        },
        {
            id: 'set-age',
            type: NodeType.REGULAR,
            name: 'Set Age',
            handler: 'setAge',
            next: 'set-income',
        },
        {
            id: 'set-income',
            type: NodeType.REGULAR,
            name: 'Set Income',
            handler: 'setIncome',
            next: 'check-customer-type',
        },
        {
            id: 'check-customer-type',
            type: NodeType.CONDITION,
            name: 'Check Customer Type',
            branches: [
                {
                    condition: 'isPremiumCustomer',
                    next: 'set-premium-status',
                },
                {
                    condition: 'isPreferredCustomer',
                    next: 'set-preferred-status',
                },
                {
                    condition: 'isRegularCustomer',
                    next: 'set-regular-status',
                },
            ],
            default: 'set-basic-status',
        },
        {
            id: 'set-premium-status',
            type: NodeType.REGULAR,
            name: 'Set Premium Status',
            handler: 'setPremiumStatus',
            next: 'end',
        },
        {
            id: 'set-preferred-status',
            type: NodeType.REGULAR,
            name: 'Set Preferred Status',
            handler: 'setPreferredStatus',
            next: 'end',
        },
        {
            id: 'set-regular-status',
            type: NodeType.REGULAR,
            name: 'Set Regular Status',
            handler: 'setRegularStatus',
            next: 'end',
        },
        {
            id: 'set-basic-status',
            type: NodeType.REGULAR,
            name: 'Set Basic Status',
            handler: 'setBasicStatus',
            next: 'end',
        },
        {
            id: 'end',
            type: NodeType.END,
            name: 'End',
        },
    ],
    initialContext: {
        name: 'John Doe',
        age: 0,
        income: 0,
        status: 'Unknown',
    },
};
