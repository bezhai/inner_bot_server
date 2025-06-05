import { UserRepository } from 'dal/repositories/repositories';
import { cache } from 'utils/cache/cache-decorator';

class UserService {
    @cache({ type: 'local', ttl: 60 * 60 * 24 })
    static async getUserName(unionId: string): Promise<string> {
        const userInfo = await UserRepository.findOne({ where: { union_id: unionId } });
        return userInfo?.name || '';
    }
}

// 批量获取用户名映射, 调用getUserName
export async function batchGetUserName(unionIds: string[]): Promise<Record<string, string>> {
    const userNames = await Promise.all(unionIds.map(UserService.getUserName));
    return userNames.reduce(
        (acc, name, index) => {
            acc[unionIds[index]] = name;
            return acc;
        },
        {} as Record<string, string>,
    );
}
