export function getVerificationToken() {
    if (process.env.IS_DEV === "true") {
        return process.env.DEV_VERIFICATION_TOKEN!;
    } else {
        return process.env.MAIN_VERIFICATION_TOKEN!;
    }
}

export function getEncryptKey() {
    if (process.env.IS_DEV === "true") {
        return process.env.DEV_ENCRYPT_KEY!;
    } else {
        return process.env.MAIN_ENCRYPT_KEY!;
    }
}

export function getBotUnionId() {
    if (process.env.IS_DEV === "true") {
        return process.env.DEV_ROBOT_UNION_ID!;
    } else {
        return process.env.MAIN_ROBOT_UNION_ID!;
    }
}

export function getBotAppId() {
    if (process.env.IS_DEV === "true") {
        return process.env.DEV_BOT_APP_ID!;
    } else {
        return process.env.MAIN_BOT_APP_ID!;
    }
}

export function getBotAppSecret() {
    if (process.env.IS_DEV === "true") {
        return process.env.DEV_BOT_APP_SECRET!;
    } else {
        return process.env.MAIN_BOT_APP_SECRET!;
    }
}
