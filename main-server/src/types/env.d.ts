declare namespace NodeJS {
    interface ProcessEnv {
        DEV_VERIFICATION_TOKEN: string;
        DEV_ENCRYPT_KEY: string;
        MAIN_VERIFICATION_TOKEN: string;
        MAIN_ENCRYPT_KEY: string;
        MAIN_ROBOT_UNION_ID: string;
        DEV_ROBOT_UNION_ID: string;
        REDIS_PASSWORD: string;
        REDIS_IP: string;
        MONGO_INITDB_ROOT_PASSWORD: string;
        MONGO_INITDB_ROOT_USERNAME: string;
        MONGO_INITDB_HOST: string;
        AI_SERVER_HOST: string;
        AI_SERVER_PORT: string;
        MAIN_BOT_APP_ID: string;
        MAIN_BOT_APP_SECRET: string;
        DEV_BOT_APP_ID: string;
        DEV_BOT_APP_SECRET: string;
        IS_DEV: string; // true or false
        POSTGRES_USER: string;
        POSTGRES_PASSWORD: string;
        POSTGRES_DB: string;
        POSTGRES_HOST: string;
        NEED_INIT: string; // true or false
        HTTP_SECRET: string;
        PROXY_HOST: string;
        MEME_HOST: string;
        MEME_PORT: string;
        USE_WEBSOCKET: string; // true or false
        ENABLE_FILE_LOGGING: string; // true or false
        LOG_LEVEL: string; // info, warn, error, debug
        LOG_DIR: string; // /var/log/main-server
        SYNCHRONIZE_DB: string; // true or false
        MEMORY_SERVICE_HOST: string;
        MEMORY_SERVICE_PORT: string;
        AI_PROVIDER_ADMIN_KEY: string;
    }
}
