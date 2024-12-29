import { upsertAllChatInfo } from "./group";

export async function botInitialization() {
  if (process.env.NEED_INIT !== "true") {
    return;
  }

  await Promise.all([upsertAllChatInfo()]);
}
