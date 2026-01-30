import { Context, Next } from 'koa';

/**
 * 验证错误类
 */
export class ValidationError extends Error {
    constructor(message: string, public field: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

/**
 * 验证规则类型
 */
export interface ValidationRule {
    required?: boolean;
    type?: 'string' | 'number' | 'boolean';
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    custom?: (value: any) => boolean | string;
}

/**
 * 验证规则集合
 */
export interface ValidationRules {
    [key: string]: ValidationRule;
}

/**
 * 创建请求体验证中间件
 */
export function validateBody(rules: ValidationRules) {
    return async (ctx: Context, next: Next) => {
        try {
            const body = (ctx.request as any).body || {};
            validateFields(body, rules);
            await next();
        } catch (error) {
            if (error instanceof ValidationError) {
                ctx.status = 400;
                ctx.body = {
                    success: false,
                    message: `参数验证失败: ${error.message}`,
                    field: error.field,
                    error_code: 'VALIDATION_ERROR'
                };
                return;
            }
            throw error;
        }
    };
}

/**
 * 创建查询参数验证中间件
 */
export function validateQuery(rules: ValidationRules) {
    return async (ctx: Context, next: Next) => {
        try {
            const query = ctx.request.query || {};
            validateFields(query, rules);
            await next();
        } catch (error) {
            if (error instanceof ValidationError) {
                ctx.status = 400;
                ctx.body = {
                    success: false,
                    message: `查询参数验证失败: ${error.message}`,
                    field: error.field,
                    error_code: 'VALIDATION_ERROR'
                };
                return;
            }
            throw error;
        }
    };
}

/**
 * 验证字段
 */
function validateFields(data: any, rules: ValidationRules): void {
    for (const [fieldName, rule] of Object.entries(rules)) {
        const value = data[fieldName];
        
        // 检查必填字段
        if (rule.required && (value === undefined || value === null || value === '')) {
            throw new ValidationError(`${fieldName} 是必填字段`, fieldName);
        }
        
        // 如果字段不存在且非必填，跳过后续验证
        if (value === undefined || value === null) {
            continue;
        }
        
        // 类型验证
        if (rule.type && !validateType(value, rule.type)) {
            throw new ValidationError(`${fieldName} 类型必须是 ${rule.type}`, fieldName);
        }
        
        // 字符串长度验证
        if (rule.type === 'string' || typeof value === 'string') {
            if (rule.minLength && value.length < rule.minLength) {
                throw new ValidationError(`${fieldName} 长度不能少于 ${rule.minLength} 个字符`, fieldName);
            }
            if (rule.maxLength && value.length > rule.maxLength) {
                throw new ValidationError(`${fieldName} 长度不能超过 ${rule.maxLength} 个字符`, fieldName);
            }
        }
        
        // 正则验证
        if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
            throw new ValidationError(`${fieldName} 格式不正确`, fieldName);
        }
        
        // 自定义验证
        if (rule.custom) {
            const result = rule.custom(value);
            if (result !== true) {
                const message = typeof result === 'string' ? result : `${fieldName} 验证失败`;
                throw new ValidationError(message, fieldName);
            }
        }
    }
}

/**
 * 验证值的类型
 */
function validateType(value: any, type: string): boolean {
    switch (type) {
        case 'string':
            return typeof value === 'string';
        case 'number':
            return typeof value === 'number' && !isNaN(value);
        case 'boolean':
            return typeof value === 'boolean';
        default:
            return false;
    }
}

/**
 * 图片处理请求验证规则
 */
export const imageProcessValidationRules: ValidationRules = {
    message_id: {
        required: false,
        type: 'string',
        minLength: 1,
        maxLength: 200,
        pattern: /^[a-zA-Z0-9_-]+$/,
        custom: (value: string) => {
            if (!value.trim()) {
                return 'message_id 不能为空白字符';
            }
            return true;
        },
    },
    file_key: {
        required: true,
        type: 'string',
        minLength: 1,
        maxLength: 200,
        pattern: /^[a-zA-Z0-9_.-]+$/,
        custom: (value: string) => {
            if (!value.trim()) {
                return 'file_key 不能为空白字符';
            }
            return true;
        },
    },
};

/**
 * base64图片上传验证规则
 */
export const base64ImageUploadValidationRules: ValidationRules = {
    base64_data: {
        required: true,
        type: 'string',
        minLength: 1,
        custom: (value: string) => {
            if (!value.trim()) {
                return 'base64_data 不能为空白字符';
            }
            
            // 检查是否是有效的 data:image base64 格式
            const base64Regex = /^data:image\/(png|jpg|jpeg|gif|bmp|webp);base64,[A-Za-z0-9+/]+(={0,2})?$/;
            if (!base64Regex.test(value)) {
                return 'base64_data 必须是有效的图片 base64 格式（需要包含 data:image/... 前缀）';
            }
            
            return true;
        }
    }
};