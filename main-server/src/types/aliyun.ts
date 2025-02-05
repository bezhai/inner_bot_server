export interface LarkFileTransferRequest {
  file_key: string;
  message_id: string;
  destination: string;
}

export interface LarkFileTransferResponse {
  url: string;
}

export interface LarkFileTransferInfo {
  file_key: string;
  url: string;
}
