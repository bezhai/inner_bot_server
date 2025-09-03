/**
 * @file bangumi-tool.ts
 * @description 完整的Bangumi工具集，基于ai-service迁移
 */

import axios from 'axios';
import {
    Subject,
    SimpleSubject,
    SubjectSearchResult,
    SubjectForAIResult,
    Character,
    SimpleCharacter,
    CharacterSearchResult,
    CharacterForAIResult,
    Person,
    SimplePerson,
    PersonSearchResult,
    PersonForAIResult,
    SubjectCharacter,
    SimpleSubjectCharacter,
    SubjectPerson,
    SimpleSubjectPerson,
    SubjectRelation,
    SimpleSubjectRelation,
    CharacterSubject,
    SimpleCharacterSubject,
    CharacterPerson,
    SimpleCharacterPerson,
    PersonCharacter,
    SimplePersonCharacter,
    PersonSubject,
    SimplePersonSubject,
    SubjectType,
    subjectTypeToString,
    CharacterType,
    characterTypeToString,
    PersonType,
    personTypeToString,
    Career,
    careerToString,
} from './bangumi-models';

/**
 * 发送Bangumi API请求的通用函数
 */
async function sendBangumiRequest(
    path: string,
    params?: Record<string, any>,
    method: 'GET' | 'POST' = 'GET',
    data?: Record<string, any>
): Promise<any> {
    const headers = {
        'Authorization': `Bearer ${process.env.BANGUMI_ACCESS_TOKEN || ''}`,
        'Content-Type': 'application/json',
        'User-Agent': 'panda1234/search',
    };

    const baseUrl = 'https://api.bgm.tv';
    const url = `${baseUrl}${path}`;

    try {
        const response = await axios({
            method,
            url,
            headers,
            params: params || {},
            data: data || undefined,
            timeout: 15000,
        });

        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
            throw new Error('Bangumi API认证失败，请检查access token配置');
        }
        throw error;
    }
}

/**
 * 将Subject转换为SimpleSubject
 */
function subjectToSimple(subject: Subject): SimpleSubject {
    return {
        id: subject.id,
        type: subjectTypeToString(subject.type),
        name: subject.name,
        name_cn: subject.name_cn,
        summary: subject.summary,
        date: subject.date,
        platform: subject.platform,
        infobox: subject.infobox,
        score: subject.rating?.score,
        tags: subject.tags?.map(tag => tag.name),
    };
}

/**
 * 将Character转换为SimpleCharacter
 */
function characterToSimple(character: Character): SimpleCharacter {
    return {
        id: character.id,
        name: character.name,
        type: characterTypeToString(character.type),
        summary: character.summary,
        infobox: character.infobox,
        gender: character.gender,
        blood_type: character.blood_type,
        birth_year: character.birth_year,
        birth_mon: character.birth_mon,
        birth_day: character.birth_day,
    };
}

/**
 * 将Person转换为SimplePerson
 */
function personToSimple(person: Person): SimplePerson {
    return {
        id: person.id,
        name: person.name,
        type: personTypeToString(person.type),
        career: person.career.map(careerToString),
        summary: person.summary,
        infobox: person.infobox,
    };
}

/**
 * 获取条目详细信息
 */
async function getSubjectInfo(subjectId: number): Promise<SimpleSubject> {
    const response = await sendBangumiRequest(`/v0/subjects/${subjectId}`);
    return subjectToSimple(response as Subject);
}

/**
 * 获取角色详细信息
 */
async function getCharacterInfo(characterId: number): Promise<SimpleCharacter> {
    const response = await sendBangumiRequest(`/v0/characters/${characterId}`);
    return characterToSimple(response as Character);
}

/**
 * 获取人物详细信息
 */
async function getPersonInfo(personId: number): Promise<SimplePerson> {
    const response = await sendBangumiRequest(`/v0/persons/${personId}`);
    return personToSimple(response as Person);
}

/**
 * 搜索条目
 */
export async function searchSubjects(args: {
    types?: string[];
    keyword?: string;
    sort?: string;
    limit?: number;
    offset?: number;
    tags?: string[];
    start_date?: string;
    end_date?: string;
    min_rating?: number;
    max_rating?: number;
}): Promise<SubjectForAIResult> {
    const {
        types,
        keyword,
        sort = 'match',
        limit = 10,
        offset = 0,
        tags,
        start_date,
        end_date,
        min_rating,
        max_rating,
    } = args;

    // 构建筛选条件
    const searchFilter: Record<string, any> = {};
    
    if (types && types.length > 0) {
        const typeMapping: Record<string, number> = {
            '书籍': 1,
            '动画': 2,
            '音乐': 3,
            '游戏': 4,
            '三次元': 6,
        };
        searchFilter.type = types.map(t => typeMapping[t]).filter(Boolean);
    }

    if (tags && tags.length > 0) {
        searchFilter.tag = tags;
    }

    if (start_date) {
        searchFilter.air_date = searchFilter.air_date || [];
        searchFilter.air_date.push(`>=${start_date}`);
    }

    if (end_date) {
        searchFilter.air_date = searchFilter.air_date || [];
        searchFilter.air_date.push(`<${end_date}`);
    }

    if (min_rating) {
        searchFilter.rating = searchFilter.rating || [];
        searchFilter.rating.push(`>=${min_rating}`);
    }

    if (max_rating) {
        searchFilter.rating = searchFilter.rating || [];
        searchFilter.rating.push(`<=${max_rating}`);
    }

    // 构建请求体
    const requestBody: Record<string, any> = { keyword, sort };
    if (Object.keys(searchFilter).length > 0) {
        requestBody.filter = searchFilter;
    }

    // 构建查询参数
    const params: Record<string, any> = {};
    if (limit !== 30) {
        params.limit = limit;
    }
    if (offset !== 0) {
        params.offset = offset;
    }

    console.info('搜索Bangumi条目', { keyword, types, sort, limit });

    const response = await sendBangumiRequest('/v0/search/subjects', params, 'POST', requestBody);
    const midResult = response as SubjectSearchResult;
    
    return {
        total: midResult.total,
        limit: midResult.limit,
        offset: midResult.offset,
        data: midResult.data.map(subjectToSimple),
    };
}

/**
 * 搜索角色
 */
export async function searchCharacters(args: {
    keyword: string;
    limit?: number;
    offset?: number;
}): Promise<CharacterForAIResult> {
    const { keyword, limit = 30, offset = 0 } = args;

    const requestBody = { keyword };

    const params: Record<string, any> = {};
    if (limit !== 30) {
        params.limit = limit;
    }
    if (offset !== 0) {
        params.offset = offset;
    }

    console.info('搜索Bangumi角色', { keyword, limit });

    const response = await sendBangumiRequest('/v0/search/characters', params, 'POST', requestBody);
    const midResult = response as CharacterSearchResult;
    
    return {
        total: midResult.total,
        limit: midResult.limit,
        offset: midResult.offset,
        data: midResult.data.map(characterToSimple),
    };
}

/**
 * 搜索人物
 */
export async function searchPersons(args: {
    keyword: string;
    careers?: string[];
    limit?: number;
    offset?: number;
}): Promise<PersonForAIResult> {
    const { keyword, careers, limit = 10, offset = 0 } = args;

    const requestBody: Record<string, any> = { keyword };
    
    if (careers && careers.length > 0) {
        const careerMapping: Record<string, Career> = {
            '制作人员': Career.PRODUCER,
            '漫画家': Career.MANGAKA,
            '音乐人': Career.ARTIST,
            '声优': Career.SEIYU,
            '作家': Career.WRITER,
            '绘师': Career.ILLUSTRATOR,
            '演员': Career.ACTOR,
        };
        requestBody.career = careers.map(c => careerMapping[c]).filter(Boolean);
    }

    const params: Record<string, any> = {};
    if (limit !== 10) {
        params.limit = limit;
    }
    if (offset !== 0) {
        params.offset = offset;
    }

    console.info('搜索Bangumi人物', { keyword, careers, limit });

    const response = await sendBangumiRequest('/v0/search/persons', params, 'POST', requestBody);
    const midResult = response as PersonSearchResult;
    
    return {
        total: midResult.total,
        limit: midResult.limit,
        offset: midResult.offset,
        data: midResult.data.map(personToSimple),
    };
}

/**
 * 获取条目关联的角色
 */
export async function getSubjectCharacters(args: {
    subject_id: number;
}): Promise<SimpleSubjectCharacter[]> {
    const { subject_id } = args;

    console.info('获取条目角色', { subject_id });

    const response = await sendBangumiRequest(`/v0/subjects/${subject_id}/characters`);
    const characters = response as SubjectCharacter[];
    
    const result: SimpleSubjectCharacter[] = [];
    for (const char of characters) {
        const simple: SimpleSubjectCharacter = {
            id: char.id,
            name: char.name,
            type: characterTypeToString(char.type),
            relation: char.relation,
            actor: char.actor?.map(personToSimple),
        };
        
        try {
            simple.detail = await getCharacterInfo(char.id);
        } catch (error) {
            console.warn(`获取角色详情失败 ${char.id}:`, error);
        }
        
        result.push(simple);
    }
    
    return result;
}

/**
 * 获取条目关联的人物
 */
export async function getSubjectPersons(args: {
    subject_id: number;
}): Promise<SimpleSubjectPerson[]> {
    const { subject_id } = args;

    console.info('获取条目人物', { subject_id });

    const response = await sendBangumiRequest(`/v0/subjects/${subject_id}/persons`);
    const persons = response as SubjectPerson[];
    
    const result: SimpleSubjectPerson[] = [];
    for (const person of persons) {
        const simple: SimpleSubjectPerson = {
            id: person.id,
            name: person.name,
            type: personTypeToString(person.type),
            relation: person.relation,
            eps: person.eps,
            career: person.career.map(careerToString),
        };
        
        try {
            simple.detail = await getPersonInfo(person.id);
        } catch (error) {
            console.warn(`获取人物详情失败 ${person.id}:`, error);
        }
        
        result.push(simple);
    }
    
    return result;
}

/**
 * 获取条目关联的条目
 */
export async function getSubjectRelations(args: {
    subject_id: number;
}): Promise<SimpleSubjectRelation[]> {
    const { subject_id } = args;

    console.info('获取条目关联', { subject_id });

    const response = await sendBangumiRequest(`/v0/subjects/${subject_id}/relations`);
    const relations = response as SubjectRelation[];
    
    const result: SimpleSubjectRelation[] = [];
    for (const relation of relations) {
        const simple: SimpleSubjectRelation = {
            id: relation.id,
            type: subjectTypeToString(relation.type),
            name: relation.name,
            name_cn: relation.name_cn,
            relation: relation.relation,
        };
        
        try {
            simple.detail = await getSubjectInfo(relation.id);
        } catch (error) {
            console.warn(`获取条目详情失败 ${relation.id}:`, error);
        }
        
        result.push(simple);
    }
    
    return result;
}

/**
 * 获取角色关联的条目
 */
export async function getCharacterSubjects(args: {
    character_id: number;
}): Promise<SimpleCharacterSubject[]> {
    const { character_id } = args;

    console.info('获取角色条目', { character_id });

    const response = await sendBangumiRequest(`/v0/characters/${character_id}/subjects`);
    const subjects = response as CharacterSubject[];
    
    const result: SimpleCharacterSubject[] = [];
    for (const subject of subjects) {
        const simple: SimpleCharacterSubject = {
            id: subject.id,
            type: subjectTypeToString(subject.type),
            staff: subject.staff,
            name: subject.name,
            name_cn: subject.name_cn,
        };
        
        try {
            simple.detail = await getSubjectInfo(subject.id);
        } catch (error) {
            console.warn(`获取条目详情失败 ${subject.id}:`, error);
        }
        
        result.push(simple);
    }
    
    return result;
}

/**
 * 获取角色关联的人物
 */
export async function getCharacterPersons(args: {
    character_id: number;
}): Promise<SimpleCharacterPerson[]> {
    const { character_id } = args;

    console.info('获取角色人物', { character_id });

    const response = await sendBangumiRequest(`/v0/characters/${character_id}/persons`);
    const persons = response as CharacterPerson[];
    
    const result: SimpleCharacterPerson[] = [];
    for (const person of persons) {
        const simple: SimpleCharacterPerson = {
            id: person.id,
            name: person.name,
            type: personTypeToString(person.type),
            subject_id: person.subject_id,
            subject_type: subjectTypeToString(person.subject_type),
            subject_name: person.subject_name,
            subject_name_cn: person.subject_name_cn,
            staff: person.staff,
        };
        
        try {
            simple.detail = await getPersonInfo(person.id);
        } catch (error) {
            console.warn(`获取人物详情失败 ${person.id}:`, error);
        }
        
        result.push(simple);
    }
    
    return result;
}

/**
 * 获取人物关联的角色
 */
export async function getPersonCharacters(args: {
    person_id: number;
}): Promise<SimplePersonCharacter[]> {
    const { person_id } = args;

    console.info('获取人物角色', { person_id });

    const response = await sendBangumiRequest(`/v0/persons/${person_id}/characters`);
    const characters = response as PersonCharacter[];
    
    const result: SimplePersonCharacter[] = [];
    for (const character of characters) {
        const simple: SimplePersonCharacter = {
            id: character.id,
            name: character.name,
            type: characterTypeToString(character.type),
            subject_id: character.subject_id,
            subject_type: subjectTypeToString(character.subject_type),
            subject_name: character.subject_name,
            subject_name_cn: character.subject_name_cn,
            staff: character.staff,
        };
        
        try {
            simple.detail = await getCharacterInfo(character.id);
        } catch (error) {
            console.warn(`获取角色详情失败 ${character.id}:`, error);
        }
        
        result.push(simple);
    }
    
    return result;
}

/**
 * 获取人物关联的条目
 */
export async function getPersonSubjects(args: {
    person_id: number;
}): Promise<SimplePersonSubject[]> {
    const { person_id } = args;

    console.info('获取人物条目', { person_id });

    const response = await sendBangumiRequest(`/v0/persons/${person_id}/subjects`);
    const subjects = response as PersonSubject[];
    
    const result: SimplePersonSubject[] = [];
    for (const subject of subjects) {
        const simple: SimplePersonSubject = {
            id: subject.id,
            name: subject.name,
            type: subjectTypeToString(subject.type),
            image: subject.image,
            staff: subject.staff,
        };
        
        try {
            simple.detail = await getSubjectInfo(subject.id);
        } catch (error) {
            console.warn(`获取条目详情失败 ${subject.id}:`, error);
        }
        
        result.push(simple);
    }
    
    return result;
}

/**
 * 统一的Bangumi搜索接口
 * 这个函数模拟了ai-service中的bangumi_search功能，提供一个统一的入口
 */
export async function bangumiSearch(args: {
    query: string;
}): Promise<string> {
    const { query } = args;

    try {
        console.info('执行Bangumi统一搜索', { query });

        // 这里简化实现，直接调用搜索条目功能
        // 在实际使用中，应该根据query的内容智能选择合适的搜索方法
        // 或者集成LLM来分析query并调用相应的API

        // 先尝试搜索条目
        const subjectResult = await searchSubjects({ keyword: query, limit: 5 });
        
        if (subjectResult.data.length > 0) {
            let result = `找到以下相关条目：\n\n`;
            for (const subject of subjectResult.data) {
                result += `**${subject.name}** (${subject.name_cn || ''})\n`;
                result += `类型: ${subject.type}\n`;
                if (subject.score) {
                    result += `评分: ${subject.score}\n`;
                }
                if (subject.date) {
                    result += `日期: ${subject.date}\n`;
                }
                if (subject.summary) {
                    result += `简介: ${subject.summary.substring(0, 100)}${subject.summary.length > 100 ? '...' : ''}\n`;
                }
                result += '\n';
            }
            return result;
        }

        // 如果条目搜索无结果，尝试搜索角色
        const characterResult = await searchCharacters({ keyword: query, limit: 5 });
        
        if (characterResult.data.length > 0) {
            let result = `找到以下相关角色：\n\n`;
            for (const character of characterResult.data) {
                result += `**${character.name}** (${character.type})\n`;
                if (character.summary) {
                    result += `简介: ${character.summary.substring(0, 100)}${character.summary.length > 100 ? '...' : ''}\n`;
                }
                result += '\n';
            }
            return result;
        }

        // 如果角色搜索也无结果，尝试搜索人物
        const personResult = await searchPersons({ keyword: query, limit: 5 });
        
        if (personResult.data.length > 0) {
            let result = `找到以下相关人物：\n\n`;
            for (const person of personResult.data) {
                result += `**${person.name}** (${person.type})\n`;
                result += `职业: ${person.career.join(', ')}\n`;
                if (person.summary) {
                    result += `简介: ${person.summary.substring(0, 100)}${person.summary.length > 100 ? '...' : ''}\n`;
                }
                result += '\n';
            }
            return result;
        }

        return `抱歉，没有找到与"${query}"相关的内容。`;

    } catch (error) {
        console.error('Bangumi搜索失败:', error);
        return `抱歉，搜索时发生错误: ${error instanceof Error ? error.message : String(error)}`;
    }
}

// 为了向后兼容，保留原有的searchBangumiSubjects函数
export async function searchBangumiSubjects(args: {
    keyword: string;
    types?: Array<'书籍' | '动画' | '音乐' | '游戏' | '三次元'>;
    sort?: 'match' | 'heat' | 'score';
    limit?: number;
}): Promise<{ total: number; limit: number; offset: number; data: any[] }> {
    const result = await searchSubjects({
        keyword: args.keyword,
        types: args.types,
        sort: args.sort,
        limit: args.limit,
    });
    
    // 转换数据格式以保持向后兼容
    return {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        data: result.data.map(subject => ({
            id: subject.id,
            type: subject.type,
            name: subject.name,
            name_cn: subject.name_cn,
            summary: subject.summary,
            date: subject.date,
            platform: subject.platform,
            score: subject.score,
            tags: subject.tags,
        })),
    };
}