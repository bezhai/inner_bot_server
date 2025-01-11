import { LarkCallbackInfo } from "../../types/lark";

export async function startDownloadByAuthor(
  data: LarkCallbackInfo
) {
  try {
    console.log(data.action.form_value);
  } catch (e) {
    console.error(e);
  }
}
