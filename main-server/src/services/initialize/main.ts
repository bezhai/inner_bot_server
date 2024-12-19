import { upsertAllChatInfo } from "./group";

export async function botInitialization() {
    await Promise.all([
        upsertAllChatInfo(),
    ]);
}