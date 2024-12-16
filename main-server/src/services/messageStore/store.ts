import { getMessageCollection } from "../../mongo/client";
import { LarkMessageMetaInfo } from "../../types/mongo";

export async function saveMessage(message: LarkMessageMetaInfo) {
  const collection = await getMessageCollection();
  return collection.insertOne(message);
}

export async function getMessage(messageId: string) {
  const collection = await getMessageCollection();
  return collection.findOne({ message_id: messageId });
}

export async function recallMessage(messageId: string) {
  const collection = await getMessageCollection();
  return collection.updateOne({ message_id: messageId }, { is_delete: true });
}

export async function updateRobotMessageText(messageId: string, text: string) {
  const collection = await getMessageCollection();
  return collection.updateOne({ message_id: messageId }, { robot_text: text });
}

export async function searchMessageByRootId(
  rootId: string,
  messageType = "text",
  limit = 8
) {
  const collection = await getMessageCollection();
  return collection.find(
    {
      root_id: rootId,
      $and: [{ message_type: messageType }, { is_from_robot: true }],
      is_delete: false,
    },
    { sort: { create_time: -1 }, limit }
  );
}
