import { MessageCollection } from "../../dal/mongo/client";
import { LarkMessageMetaInfo } from "../../types/mongo";

export async function saveMessage(message: LarkMessageMetaInfo) {
  return MessageCollection.insertOne(message);
}

export async function getMessage(messageId: string) {
  return MessageCollection.findOne({ message_id: messageId });
}

export async function recallMessage(messageId: string) {
  return MessageCollection.updateOne({ message_id: messageId }, { is_delete: true });
}

export async function updateRobotMessageText(messageId: string, text: string) {
  return MessageCollection.updateOne({ message_id: messageId }, { robot_text: text });
}

export async function searchMessageByRootId(
  rootId: string,
  messageType = "text",
  limit = 14
) {
  return MessageCollection.find(
    {
      root_id: rootId,
      $or: [{ message_type: messageType }, { is_from_robot: true }],
      is_delete: false,
    },
    { sort: { create_time: -1 }, limit }
  );
}
