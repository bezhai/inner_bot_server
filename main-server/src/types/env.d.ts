declare namespace NodeJS {
    interface ProcessEnv {
        REDIS_PASSWORD: string;
        REDIS_HOST: string;
        MONGO_INITDB_ROOT_PASSWORD: string;
        MONGO_INITDB_ROOT_USERNAME: string;
        MONGO_HOST: string;
        AI_SERVER_HOST: string;
        AI_SERVER_PORT: string;
        POSTGRES_USER: string;
        POSTGRES_PASSWORD: string;
        POSTGRES_DB: string;
        POSTGRES_HOST: string;
        NEED_INIT: string; // true or false
        PROXY_HTTP_SECRET: string;
        PROXY_HOST: string;
        MEME_HOST: string;
        MEME_PORT: string;
        ENABLE_FILE_LOGGING: string; // true or false
        LOG_LEVEL: string; // info, warn, error, debug
        LOG_DIR: string; // /var/log/main-server
        SYNCHRONIZE_DB: string; // true or false
        MEMORY_BASE_URL: string;
        AI_PROVIDER_ADMIN_KEY: string;
        IS_DEV: string; // true or false
        INNER_HTTP_SECRET: string;
        OSS_ACCESS_KEY_ID: string;
        OSS_ACCESS_KEY_SECRET: string;
        OSS_BUCKET: string;
        END_POINT: string;
    }
}
