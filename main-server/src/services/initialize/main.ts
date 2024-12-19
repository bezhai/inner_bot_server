import { upsertAllChatInfo } from "./group";

export async function botInitialization() {
    Promise.all([
        upsertAllChatInfo(),
    ]);
}