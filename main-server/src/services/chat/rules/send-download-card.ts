import { CardHeader, ColumnSet, FormComponent, ImgComponent, InputComponent, LarkCard, PlainText, TableButtonComponent } from "feishu-card";
import { CommonMessage } from "../../../models/common-message";
import { replyCard } from "../../larkBasic/message";

export async function sendDownloadCard(message: CommonMessage) {
    const card = new LarkCard(new CardHeader("作者下载")).addElements(
        new FormComponent("author_download", [])
            .appendElements(
                new InputComponent("author_id").setLabel(new PlainText("作者ID")),
                new InputComponent("start_index").setLabel(new PlainText("初始pid")),
                new InputComponent("end_index").setLabel(new PlainText("结束pid")),
                new TableButtonComponent("确认下载", "form_submit")
            )
    )

    await replyCard(message.messageId, card);
}