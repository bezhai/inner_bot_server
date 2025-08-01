export interface GenerateHistoryCommand {
  chatId: string;
  requestedBy: string;
  timeRange?: {
    startDate?: Date;
    endDate?: Date;
  };
  limit?: number;
}

export interface ChatHistoryStatistics {
  totalMessages: number;
  uniqueUsers: number;
  mostActiveUser: {
    userId: string;
    userName: string;
    messageCount: number;
  };
  messagesByHour: Record<number, number>;
  topKeywords: Array<{ word: string; count: number }>;
}

export interface GenerateHistoryResult {
  success: boolean;
  statistics?: ChatHistoryStatistics;
  summary?: string;
  cardKey?: string; // Lark card template key
  error?: string;
}

export interface GenerateHistoryUseCase {
  execute(command: GenerateHistoryCommand): Promise<GenerateHistoryResult>;
}