import { CompletionRequest } from '../../../types/ai';

const BASE_URL = `http://${process.env.AI_SERVER_HOST}:${process.env.AI_SERVER_PORT}`;

export async function fetchChatCompletion(payload: CompletionRequest): Promise<Response> {
  const response = await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Chat completion request failed with status code: ${response.status}`);
  }

  return response;
}

export async function fetchAvailableModels(): Promise<string[]> {
  const response = await fetch(`${BASE_URL}/model/list`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Model list request failed with status code: ${response.status}`);
  }

  return response.json();
}
