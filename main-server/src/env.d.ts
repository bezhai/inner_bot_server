declare namespace NodeJS {
  interface ProcessEnv {
    DASHSCOPE_API_KEY: string;
    APP_ID: string;
    APP_SECRET: string;
    VERIFICATION_TOKEN: string;
    ENCRYPT_KEY: string;
    ROBOT_OPEN_ID: string;
    ADMIN_USER_ID: string;
  }
}
