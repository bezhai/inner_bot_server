import redisClient from "../redis/redisClient";
import { GetIllustInfoBody } from "../service/types";
import { cacheProxy } from "../utils/cache";
import { pixivProxy } from "./pixivProxy";
import { FollowerInfo, PixivGenericResponse, FollowerBody, AuthorArtworkResponseBody, TagArtworkResponseBody, IllustData, IllustrationPageDetail } from "./types";

/**
 * 获取用户指定标签下的关注列表
 * @param tag 标签名称
 * @returns 关注者信息数组
 */
async function getFollowersByTag(tag: string): Promise<FollowerInfo[]> {
  const userId = "35384654"; // 固定的用户 ID
  const pageSize = 24; // 每页获取的关注者数量
  const followers: FollowerInfo[] = []; // 存储所有关注者

  let page = 1;
  let total = 0;

  do {
    // 构造API请求的URL和Referer
    const pixivUrl = `https://www.pixiv.net/ajax/user/${userId}/following`;
    const referer = `https://www.pixiv.net/users/${userId}/following/${encodeURIComponent(
      tag
    )}?p=${page}`;

    try {
      // 调用 pixivProxy 以发送带有查询参数的 POST 请求
      const response = await pixivProxy<PixivGenericResponse<FollowerBody>>(
        pixivUrl,
        referer,
        {
          offset: (page - 1) * pageSize,
          limit: pageSize,
          rest: "show",
          tag: tag,
          lang: "zh",
        }
      );

      // 确保API请求成功并且返回了有效的body数据
      const { error, body } = response;
      if (error || !body) {
        throw new Error(response.message || "Failed to fetch followers");
      }

      console.log(
        `Fetched ${body.users.length} followers for page ${page} of total ${body.total}`
      );

      // 添加当前页的用户到总的关注者列表中
      followers.push(...body.users);
      total = body.total;

      // 增加页数，准备下一次请求
      page++;
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error);
      throw error;
    }

    // 等待2秒以避免频繁请求
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } while (page * pageSize <= total);

  return followers;
}

/**
 * 根据用户 ID 获取该作者的所有作品 ID
 * @param userId 用户 ID
 * @returns 作者的所有作品 ID 数组
 */
async function getAuthorArtwork(userId: string): Promise<string[]> {
  // 构造 API 请求的 URL 和 Referer
  const authorUrl = `https://www.pixiv.net/ajax/user/${userId}/profile/all`;
  const referer = `https://www.pixiv.net/users/${userId}`;

  try {
    // 调用 pixivProxy 以发送请求
    const response = await pixivProxy<
      PixivGenericResponse<AuthorArtworkResponseBody>
    >(authorUrl, referer, {
      lang: "zh",
      version: await redisClient.get("version"),
    });

    // 确保 API 请求成功并返回有效数据
    const { error, body } = response;
    if (error || !body) {
      throw new Error(response.message || "Failed to fetch author artworks");
    }

    // 返回作品 ID 列表
    return Object.keys(body.illusts);
  } catch (err) {
    console.error(`Error fetching artwork for user ${userId}:`, err);
    throw err;
  }
}

/**
 * 根据标签和页码获取作品 ID 列表
 * @param tag 标签名称
 * @param page 页码
 * @returns 作品 ID 数组
 */
async function getTagArtwork(tag: string, page: number): Promise<string[]> {
  // 构造 API 请求的 URL 和 Referer
  const authorUrl = `https://www.pixiv.net/ajax/search/illustrations/${encodeURIComponent(tag)}`;
  const referer = `https://www.pixiv.net/tags/${encodeURIComponent(tag)}/illustrations?order=popular_d&p=${page}`;

  try {
    // 调用 pixivProxy 以发送请求
    const response = await pixivProxy<PixivGenericResponse<TagArtworkResponseBody>>(
      authorUrl,
      referer,
      {
        word: tag,
        order: "popular_d",
        mode: "all",
        p: page.toString(),
        s_mode: "s_tag",
        type: "illust_and_ugoira",
        lang: "zh",
        version: await redisClient.get("version"),
      }
    );

    // 确保 API 请求成功并返回有效数据
    const { error, body } = response;
    if (error || !body || !body.illust) {
      throw new Error(response.message || "Failed to fetch tag artworks");
    }

    // 使用 IllustData 类的 getIDs 方法获取作品 ID
    const illustData = new IllustData(body.illust.data);
    return illustData.getIDs();
  } catch (err) {
    console.error(`Error fetching artworks for tag ${tag}, page ${page}:`, err);
    throw err;
  }
}

/**
 * 根据插画 ID 获取插画信息
 * @param illustId 插画的 ID
 * @returns 包含插画信息的对象
 * @throws 请求失败时抛出错误
 */
async function getIllustInfo(illustId: string): Promise<GetIllustInfoBody> {
  // 构造 API 请求的 URL 和 Referer
  const illustUrl = `https://www.pixiv.net/ajax/illust/${encodeURIComponent(illustId)}`;
  const referer = `https://www.pixiv.net/artworks/${encodeURIComponent(illustId)}`;

  try {
    // 调用 pixivProxy 以发送请求
    const response = await pixivProxy<PixivGenericResponse<GetIllustInfoBody>>(
      illustUrl,
      referer,
    );

    // 检查 API 响应中的错误
    if (response.error || !response.body) {
      throw new Error(response.message || "Failed to fetch illustration info");
    }

    // 返回插画信息
    return response.body;
  } catch (err) {
    console.error(`Error fetching illustration info for ID ${illustId}:`, err);
    throw new Error(`Error fetching illustration info for ID ${illustId}:`);
  }
}

async function getIllustInfoWithCache(illustId: string): Promise<GetIllustInfoBody> {
  const cacheKey = `illustInfo_${illustId}`;  // 使用插画ID作为缓存键

  // 使用 cacheProxy 包裹请求逻辑
  return cacheProxy(cacheKey, async () => {
    return await getIllustInfo(illustId);
  });
}

/**
 * 根据插画 ID 获取插画的页面详情
 * @param illustId 插画的 ID
 * @returns 包含插画页面详情的数组
 * @throws 请求失败时抛出错误
 */
export async function getIllustPageDetail(illustId: string): Promise<IllustrationPageDetail[]> {
  const illustUrl = `https://www.pixiv.net/ajax/illust/${encodeURIComponent(illustId)}/pages`;
  const referer = `https://www.pixiv.net/artworks/${encodeURIComponent(illustId)}`;

  try {
    // 调用 pixivProxy 发送请求
    const response = await pixivProxy<PixivGenericResponse<IllustrationPageDetail[]>>(
      illustUrl,
      referer,
      {
        lang: 'zh', // 请求参数
      }
    );

    // 检查响应中的错误
    if (response.error || !response.body) {
      throw new Error(response.message || 'Failed to fetch illustration page details');
    }

    // 返回插画页面详情
    return response.body;
  } catch (err) {
    console.error(`Error fetching illustration page details for ID ${illustId}:`, err);
    throw err;
  }
}

export { getFollowersByTag, getAuthorArtwork, getTagArtwork, getIllustInfoWithCache, getIllustInfo};
