import { Prompt } from '@entities';
import { PromptRepository } from 'dal/repositories/repositories';

export async function listPrompts(): Promise<Prompt[]> {
    return await PromptRepository.find();
}

export async function upsertPrompt(prompt: Prompt): Promise<Prompt> {
    return await PromptRepository.save(prompt);
}
