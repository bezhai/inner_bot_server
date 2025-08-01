import { MessageRule, RuleContext, RuleResult, RuleAction } from '../rules/rule.interface';
import { DomainEvent } from '../events/domain-event';

export class MessageRuleEngine {
  private rules: MessageRule[] = [];

  constructor(rules: MessageRule[]) {
    // Sort rules by priority (higher priority first)
    this.rules = rules.sort((a, b) => b.priority - a.priority);
  }

  async execute(context: RuleContext): Promise<RuleResult> {
    const allActions: RuleAction[] = [];
    const allEvents: DomainEvent[] = [];

    for (const rule of this.rules) {
      try {
        // Check if rule can handle this message
        const canHandle = await rule.canHandle(context);
        if (!canHandle) {
          continue;
        }

        // Execute the rule
        console.log(`Executing rule: ${rule.name}`);
        const result = await rule.handle(context);

        // Collect actions and events
        allActions.push(...result.actions);
        allEvents.push(...result.events);

        // Check if we should continue processing other rules
        if (!result.shouldContinue) {
          console.log(`Rule ${rule.name} stopped further processing`);
          break;
        }
      } catch (error) {
        console.error(`Error executing rule ${rule.name}:`, error);
        // Continue with next rule even if one fails
      }
    }

    return {
      shouldContinue: false,
      actions: allActions,
      events: allEvents,
    };
  }

  addRule(rule: MessageRule): void {
    this.rules.push(rule);
    // Re-sort rules by priority
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  removeRule(ruleName: string): void {
    this.rules = this.rules.filter(rule => rule.name !== ruleName);
  }

  getRules(): MessageRule[] {
    return [...this.rules];
  }
}