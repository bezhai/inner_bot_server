/**
 * @file doujin-tool.ts
 * @description 同人展活动搜索工具，基于allcpp.cn API
 */

import axios from 'axios';

/**
 * 同人展活动搜索结果
 */
export interface DoujinEvent {
    event_url: string;      // 活动链接
    name: string;           // 活动名称
    type: string;           // 活动类型
    tag: string;            // 活动标签
    enter_time: string;     // 活动开始时间
    end_time: string;       // 活动结束时间
    wanna_go_count: number; // 想参加人数
    prov_name: string;      // 省份
    city_name: string;      // 城市
    area_name: string;      // 地区
    enter_address: string;  // 活动地址
    ended: boolean;         // 是否已结束
    is_online: boolean;     // 是否为线上
}

/**
 * 搜索同人展活动
 */
export async function searchDoujinEvent(args: {
    query?: string;
    is_online?: boolean;
    recent_days?: number;
    activity_status?: 'ongoing' | 'ended';
    activity_type?: '茶会' | '综合同人展' | 'ONLY' | '线上活动' | '官方活动' | '综合展' | '同好包场';
}): Promise<{ list: DoujinEvent[] }> {
    const { query, is_online, recent_days, activity_status, activity_type } = args;
    
    const url = 'https://www.allcpp.cn/allcpp/event/eventMainListV2.do';
    
    let finalRecentDays = recent_days;
    if (activity_status === 'ongoing') {
        finalRecentDays = -1;
    } else if (activity_status === 'ended') {
        finalRecentDays = -2;
    }

    const typeMapping = {
        '茶会': 1,
        '综合同人展': 2,
        'ONLY': 3,
        '线上活动': 6,
        '官方活动': 7,
        '综合展': 8,
        '同好包场': 10,
    };

    const payload = {
        keyword: query,
        is_online,
        day: finalRecentDays,
        sort: 1,
        page: 1,
        page_size: 100,
        type: activity_type ? typeMapping[activity_type] : null,
    };

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
    };

    try {
        console.info('搜索同人展活动', { args });
        const response = await axios.get(url, {
            params: payload,
            headers,
            timeout: 15000,
        });

        const data = response.data;
        if (!data.result || !data.result.list) {
            return { list: [] };
        }

        const events: DoujinEvent[] = data.result.list.map((item: any) => ({
            event_url: `https://www.allcpp.cn/allcpp/event/event.do?event=${item.id}`,
            name: item.name,
            type: item.type,
            tag: item.tag,
            enter_time: item.enterTime ? new Date(item.enterTime).toISOString().split('T')[0] : '',
            end_time: item.endTime ? new Date(item.endTime).toISOString().split('T')[0] : '',
            wanna_go_count: item.wannaGoCount || 0,
            prov_name: item.provName || '',
            city_name: item.cityName || '',
            area_name: item.areaName || '',
            enter_address: item.enterAddress || '',
            ended: item.ended || false,
            is_online: item.isOnline === 1,
        }));

        console.info(`找到 ${events.length} 个同人展活动`);
        return { list: events };
    } catch (error) {
        console.error('搜索同人展活动失败', { error });
        throw new Error(`搜索同人展活动失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}