import axios, { AxiosResponse } from "axios";
import crypto from "crypto";
import { BaseResponse, ImageForLark, ListPixivImageDto, PaginationResponse, UploadImageToLarkDto, UploadLarkResp } from "./types";

// 定义请求体的接口
interface PixivProxyRequestBody {
  url: string;
  referer: string;
  debug?: boolean;
}

// 生成盐
const generateSalt = (length: number): string => {
  const letters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.randomBytes(length);
  let salt = "";
  for (let i = 0; i < length; i++) {
    salt += letters[bytes[i] % letters.length];
  }
  return salt;
};

const generateToken = (salt: string, body: string, secret: string): string => {
  const data = salt + body + secret;
  const hash = crypto.createHash("sha256").update(data).digest("hex");
  return hash;
};

/**
 * sendAuthenticatedRequest - 发送带有鉴权信息的 POST 请求
 * @param url 请求的 URL
 * @param reqBody 请求体
 * @returns 响应体
 */
async function sendAuthenticatedRequest<T>(
  url: string,
  reqBody: Record<string, any>
): Promise<T> {
  const salt = generateSalt(10);
  const token = generateToken(
    salt,
    JSON.stringify(reqBody),
    process.env.HTTP_SECRET!
  );

  try {
    const response: AxiosResponse<T> = await axios.post<T>(url, reqBody, {
      headers: {
        "X-Salt": salt,
        "X-Token": token,
        "Content-Type": "application/json",
      },
    });

    return response.data;
  } catch (error: any) {
    console.error("Error in sendAuthenticatedRequest:", error);
    throw new Error(`Request failed: ${error.message}`);
  }
}

/**
 * pixivProxy - 发送带有 referer 和参数的 POST 请求
 * @param baseUrl 要请求的 Base URL
 * @param referer 请求头中的 Referer
 * @param params 请求的查询参数
 * @returns 响应体
 */
export async function pixivProxy<T>(
  baseUrl: string,
  referer: string,
  params: Record<string, any> = {}
): Promise<T> {
  // 构建请求体

  const urlEncode = (params: Record<string, any>) => {
    const encode = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === "string" && v !== "") {
        encode.append(k, v);
      } else if (Array.isArray(v)) {
        for (const val of v) {
          if (val !== "") {
            encode.append(k, val);
          }
        }
      } else {
        const strVal = String(v ?? "");
        if (strVal !== "") {
          encode.append(k, strVal);
        }
      }
    }
    return encode.toString();
  };

  // 如果有查询参数，拼接到 baseUrl
  if (Object.keys(params).length > 0) {
    baseUrl += `?${urlEncode(params)}`;
  }

  const reqBody: PixivProxyRequestBody = {
    url: baseUrl,
    referer: referer,
    // debug: true,
  };

  return await sendAuthenticatedRequest<T>("http://www.yuanzhi.xyz/api/v2/proxy", reqBody)
}

/**
 * getContent - 请求指定 URL 的内容
 * @param url 要请求的 Pixiv URL
 * @returns Promise<void> 表示成功或失败
 */
export async function getContent(url: string): Promise<void> {
  // 构建请求体
  const reqBody = {
    pixiv_url: url, // 对应 Go 中的 PixivUrl 字段
  };

  try {
    // 使用 sendAuthenticatedRequest 发送请求
    const response = await sendAuthenticatedRequest<BaseResponse<void>>(
      "http://www.yuanzhi.xyz/api/v2/image-store/download",
      reqBody
    );

    // 检查响应的 code 字段
    if (response.code !== 0) {
      throw new Error(response.msg);
    }
  } catch (error: any) {
    // 捕获错误并抛出
    console.error("Error in getContent:", error);
    throw new Error(error.message || "Unknown error");
  }
}

export async function getPixivImages(params: ListPixivImageDto): Promise<ImageForLark[]> {
  try {
    const url = 'http://www.yuanzhi.xyz/api/v2/image-store/token-auth-list';

    // 发送带有身份认证的请求
    const response = await sendAuthenticatedRequest<BaseResponse<PaginationResponse<ImageForLark>>>(
      url,
      params
    );

    // 检查响应的 code 字段
    if (response.code !== 0) {
      throw new Error(response.msg);
    }


    return response.data.data;
  } catch (error: any) {
    console.error("Error in getPixivImages:", error);
    throw new Error(error.message || "Unknown error");
  }
}

export async function uploadToLark(params: UploadImageToLarkDto): Promise<UploadLarkResp> {
  try {
    const url = 'http://www.yuanzhi.xyz/api/v2/image-store/upload-lark';

    // 发送带有身份认证的请求
    const response = await sendAuthenticatedRequest<BaseResponse<UploadLarkResp>>(
      url,
      params
    );

    // 检查响应的 code 字段
    if (response.code !== 0) {
      throw new Error(response.msg);
    }


    return response.data;
  } catch (error: any) {
    console.error("Error in getPixivImages:", error);
    throw new Error(error.message || "Unknown error");
  }
}