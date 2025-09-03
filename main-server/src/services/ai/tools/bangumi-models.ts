/**
 * @file bangumi-models.ts
 * @description Bangumi API数据模型定义，基于ai-service/models.py迁移
 */

/**
 * 图片结构
 */
export interface Images {
    large?: string;
    common?: string;
    medium?: string;
    small?: string;
    grid?: string;
}

/**
 * Wiki信息框项目
 */
export interface WikiInfoboxItem {
    key: string;
    value: any; // 可能是字符串或复杂对象
}

/**
 * 条目评分信息
 */
export interface SubjectRating {
    rank?: number;
    total?: number;
    count?: Record<string, number>; // "1": count, "2": count, etc.
    score?: number;
}

/**
 * 条目收藏信息
 */
export interface SubjectCollection {
    wish?: number;
    collect?: number;
    doing?: number;
    on_hold?: number;
    dropped?: number;
}

/**
 * 条目标签
 */
export interface SubjectTag {
    name: string;
    count: number;
}

/**
 * 条目类型枚举
 */
export enum SubjectType {
    BOOK = 1,
    ANIME = 2,
    MUSIC = 3,
    GAME = 4,
    THIRD_PARTY = 6,
}

/**
 * 条目类型转换为中文字符串
 */
export function subjectTypeToString(type: SubjectType): string {
    const mapping: Record<SubjectType, string> = {
        [SubjectType.BOOK]: '书籍',
        [SubjectType.ANIME]: '动画',
        [SubjectType.MUSIC]: '音乐',
        [SubjectType.GAME]: '游戏',
        [SubjectType.THIRD_PARTY]: '三次元',
    };
    return mapping[type] || '未知';
}

/**
 * 条目信息（完整版本）
 */
export interface Subject {
    id: number;
    type: SubjectType;
    name: string;
    name_cn?: string;
    summary?: string;
    series?: boolean;
    nsfw?: boolean;
    locked?: boolean;
    date?: string; // YYYY-MM-DD格式
    platform?: string;
    images?: Images;
    infobox?: WikiInfoboxItem[];
    volumes?: number;
    eps?: number;
    total_episodes?: number;
    rating?: SubjectRating;
    collection?: SubjectCollection;
    meta_tags?: string[];
    tags?: SubjectTag[];
}

/**
 * 简化条目信息
 */
export interface SimpleSubject {
    id: number;
    type: string;
    name: string;
    name_cn?: string;
    summary?: string;
    date?: string;
    platform?: string;
    infobox?: WikiInfoboxItem[];
    score?: number;
    tags?: string[];
}

/**
 * 条目搜索结果
 */
export interface SubjectSearchResult {
    total: number;
    limit: number;
    offset: number;
    data: Subject[];
}

/**
 * AI使用的条目搜索结果
 */
export interface SubjectForAIResult {
    total: number;
    limit: number;
    offset: number;
    data: SimpleSubject[];
}

/**
 * 角色类型枚举
 */
export enum CharacterType {
    CHARACTER = 1,
    MACHINE = 2,
    SHIP = 3,
    GROUP = 4,
}

/**
 * 角色类型转换为中文字符串
 */
export function characterTypeToString(type: CharacterType): string {
    const mapping: Record<CharacterType, string> = {
        [CharacterType.CHARACTER]: '角色',
        [CharacterType.MACHINE]: '机体',
        [CharacterType.SHIP]: '舰船',
        [CharacterType.GROUP]: '组织',
    };
    return mapping[type] || '未知';
}

/**
 * 角色信息（完整版本）
 */
export interface Character {
    id: number;
    name: string;
    type: CharacterType;
    summary?: string;
    locked?: boolean;
    images?: Images;
    infobox?: WikiInfoboxItem[];
    gender?: string;
    blood_type?: number; // 1=A, 2=B, 3=AB, 4=O
    birth_year?: number;
    birth_mon?: number;
    birth_day?: number;
    stat?: Record<string, number>; // comments, collects
}

/**
 * 简化角色信息
 */
export interface SimpleCharacter {
    id: number;
    name: string;
    type: string;
    summary?: string;
    infobox?: WikiInfoboxItem[];
    gender?: string;
    blood_type?: number;
    birth_year?: number;
    birth_mon?: number;
    birth_day?: number;
}

/**
 * 角色搜索结果
 */
export interface CharacterSearchResult {
    total: number;
    limit: number;
    offset: number;
    data: Character[];
}

/**
 * AI使用的角色搜索结果
 */
export interface CharacterForAIResult {
    total: number;
    limit: number;
    offset: number;
    data: SimpleCharacter[];
}

/**
 * 职业枚举
 */
export enum Career {
    PRODUCER = 'producer',
    MANGAKA = 'mangaka',
    ARTIST = 'artist',
    SEIYU = 'seiyu',
    WRITER = 'writer',
    ILLUSTRATOR = 'illustrator',
    ACTOR = 'actor',
}

/**
 * 职业转换为中文字符串
 */
export function careerToString(career: Career): string {
    const mapping: Record<Career, string> = {
        [Career.PRODUCER]: '制作人员',
        [Career.MANGAKA]: '漫画家',
        [Career.ARTIST]: '音乐人',
        [Career.SEIYU]: '声优',
        [Career.WRITER]: '作家',
        [Career.ILLUSTRATOR]: '绘师',
        [Career.ACTOR]: '演员',
    };
    return mapping[career] || '未知';
}

/**
 * 人物类型枚举
 */
export enum PersonType {
    PERSON = 1,
    COMPANY = 2,
    GROUP = 3,
}

/**
 * 人物类型转换为中文字符串
 */
export function personTypeToString(type: PersonType): string {
    const mapping: Record<PersonType, string> = {
        [PersonType.PERSON]: '个人',
        [PersonType.COMPANY]: '公司',
        [PersonType.GROUP]: '组合',
    };
    return mapping[type] || '未知';
}

/**
 * 人物信息（完整版本）
 */
export interface Person {
    id: number;
    name: string;
    type: PersonType;
    career: Career[];
    summary?: string;
    locked?: boolean;
    images?: Images;
    infobox?: WikiInfoboxItem[];
    gender?: string;
    blood_type?: number;
    birth_year?: number;
    birth_mon?: number;
    birth_day?: number;
    stat?: Record<string, number>;
}

/**
 * 简化人物信息
 */
export interface SimplePerson {
    id: number;
    name: string;
    type: string;
    career: string[];
    summary?: string;
    infobox?: WikiInfoboxItem[];
}

/**
 * 人物搜索结果
 */
export interface PersonSearchResult {
    total: number;
    limit: number;
    offset: number;
    data: Person[];
}

/**
 * AI使用的人物搜索结果
 */
export interface PersonForAIResult {
    total: number;
    limit: number;
    offset: number;
    data: SimplePerson[];
}

/**
 * 条目关联角色
 */
export interface SubjectCharacter {
    id: number;
    name: string;
    type: CharacterType;
    images?: Images;
    relation: string;
    actor?: Person[];
}

/**
 * 简化条目关联角色
 */
export interface SimpleSubjectCharacter {
    id: number;
    name: string;
    type: string;
    relation: string;
    actor?: SimplePerson[];
    detail?: SimpleCharacter;
}

/**
 * 条目关联人物
 */
export interface SubjectPerson {
    id: number;
    name: string;
    type: PersonType;
    images?: Images;
    relation: string;
    eps: string;
    career: Career[];
}

/**
 * 简化条目关联人物
 */
export interface SimpleSubjectPerson {
    id: number;
    name: string;
    type: string;
    relation: string;
    eps: string;
    career: string[];
    detail?: SimplePerson;
}

/**
 * 条目关联条目
 */
export interface SubjectRelation {
    id: number;
    type: SubjectType;
    name: string;
    name_cn?: string;
    images?: Images;
    relation: string;
}

/**
 * 简化条目关联条目
 */
export interface SimpleSubjectRelation {
    id: number;
    type: string;
    name: string;
    name_cn?: string;
    relation: string;
    detail?: SimpleSubject;
}

/**
 * 角色关联条目
 */
export interface CharacterSubject {
    id: number;
    type: SubjectType;
    staff: string;
    name: string;
    name_cn?: string;
    image: string;
}

/**
 * 简化角色关联条目
 */
export interface SimpleCharacterSubject {
    id: number;
    type: string;
    staff: string;
    name: string;
    name_cn?: string;
    detail?: SimpleSubject;
}

/**
 * 角色关联人物
 */
export interface CharacterPerson {
    id: number;
    name: string;
    type: PersonType;
    images?: Images;
    subject_id: number;
    subject_type: SubjectType;
    subject_name: string;
    subject_name_cn?: string;
    staff?: string;
}

/**
 * 简化角色关联人物
 */
export interface SimpleCharacterPerson {
    id: number;
    name: string;
    type: string;
    subject_id: number;
    subject_type: string;
    subject_name: string;
    subject_name_cn?: string;
    staff?: string;
    detail?: SimplePerson;
}

/**
 * 人物关联角色
 */
export interface PersonCharacter {
    id: number;
    name: string;
    type: CharacterType;
    images?: Images;
    subject_id: number;
    subject_type: SubjectType;
    subject_name: string;
    subject_name_cn?: string;
    staff?: string;
}

/**
 * 简化人物关联角色
 */
export interface SimplePersonCharacter {
    id: number;
    name: string;
    type: string;
    subject_id: number;
    subject_type: string;
    subject_name: string;
    subject_name_cn?: string;
    staff?: string;
    detail?: SimpleCharacter;
}

/**
 * 人物关联条目
 */
export interface PersonSubject {
    id: number;
    name: string;
    type: SubjectType;
    image?: string;
    staff?: string;
}

/**
 * 简化人物关联条目
 */
export interface SimplePersonSubject {
    id: number;
    name: string;
    type: string;
    image?: string;
    staff?: string;
    detail?: SimpleSubject;
}