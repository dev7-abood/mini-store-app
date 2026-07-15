module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/node:crypto [external] (node:crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:crypto", () => require("node:crypto"));

module.exports = mod;
}),
"[project]/app/api/telegram/order/route.js [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "POST",
    ()=>POST
]);
/*
|--------------------------------------------------------------------------
| POST /api/telegram/order
|--------------------------------------------------------------------------
| Server-side sender for the order-details message. The bot token lives
| only here (process.env.BOT_TOKEN — no public prefix, never bundled).
|
| Flow:
|   1. Validate the Telegram initData HMAC with the bot token — this
|      proves the request really came from our Mini App inside Telegram
|      and gives us the trusted user id.
|   2. Send the message to the customer's chat.
|   3. Optionally copy the restaurant chat (ADMIN_CHAT_ID).
*/ var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:crypto [external] (node:crypto, cjs)");
;
const BOT_TOKEN = process.env.BOT_TOKEN ?? '';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ?? '';
/**
 * Validate initData per Telegram's algorithm and return the user object.
 *
 * @param {string} initData Raw query string from window.Telegram.WebApp.initData
 * @returns {{id: number, first_name?: string, username?: string} | null}
 */ function validateInitData(initData) {
    if (!initData) return null;
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const dataCheckString = [
        ...params.entries()
    ].map(([key, value])=>`${key}=${value}`).sort().join('\n');
    const secretKey = __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["default"].createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const computed = __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["default"].createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (!__TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$crypto__$5b$external$5d$__$28$node$3a$crypto$2c$__cjs$29$__["default"].timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'))) {
        return null;
    }
    try {
        return JSON.parse(params.get('user') ?? 'null');
    } catch  {
        return null;
    }
}
/** Send one HTML message through the Bot API. */ async function sendMessage(chatId, html) {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            chat_id: chatId,
            text: html,
            parse_mode: 'HTML'
        })
    });
    return response.json();
}
async function POST(request) {
    if (!BOT_TOKEN) {
        return Response.json({
            ok: false,
            error: 'BOT_TOKEN is not configured'
        }, {
            status: 500
        });
    }
    const { initData, message } = await request.json().catch(()=>({}));
    if (!message || typeof message !== 'string') {
        return Response.json({
            ok: false,
            error: 'message is required'
        }, {
            status: 400
        });
    }
    const user = validateInitData(initData);
    if (!user?.id) {
        /* Reject unverified callers — otherwise anyone could use this route
       to make the bot message arbitrary chats. */ return Response.json({
            ok: false,
            error: 'invalid initData'
        }, {
            status: 401
        });
    }
    const jobs = [
        sendMessage(user.id, message)
    ];
    if (ADMIN_CHAT_ID) jobs.push(sendMessage(ADMIN_CHAT_ID, message));
    const results = await Promise.allSettled(jobs);
    const delivered = results.some((r)=>r.status === 'fulfilled' && r.value?.ok);
    return Response.json({
        ok: delivered
    });
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__1iwt8pl._.js.map