import { UserEntity } from '../entities/user.entity';

export interface UserRepository {
  save(user: UserEntity): Promise<void>;
  
  findByUnionId(unionId: string): Promise<UserEntity | null>;
  
  findByOpenId(openId: string): Promise<UserEntity | null>;
  
  findByIds(unionIds: string[]): Promise<UserEntity[]>;
  
  batchGetUserNames(unionIds: string[]): Promise<Map<string, string>>;
  
  updateAdminStatus(unionId: string, isAdmin: boolean): Promise<void>;
  
  updateUserInfo(
    unionId: string, 
    updates: {
      name?: string;
      avatarUrl?: string;
    }
  ): Promise<void>;
  
  addOpenId(unionId: string, openId: string): Promise<void>;
  
  removeOpenId(unionId: string, openId: string): Promise<void>;
  
  findAdmins(): Promise<UserEntity[]>;
  
  search(
    query: string,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<UserEntity[]>;
  
  count(): Promise<number>;
  
  deleteByUnionId(unionId: string): Promise<void>;
}