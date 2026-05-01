const { RateLimiterRedis, RateLimiterMemory } = require('rate-limiter-flexible');
const Redis = require('ioredis');

let redisClient = null;
let useRedis = false;
let redisReady = false;

const redisOptions = {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 5000),
    retryStrategy: (times) => Math.min(times * 50, 2000)
};

if (process.env.REDIS_URL || process.env.REDIS_HOST) {
    try {
        if (process.env.REDIS_URL) {
            redisClient = new Redis(process.env.REDIS_URL, redisOptions);
        } else {
            redisClient = new Redis({
                host: process.env.REDIS_HOST,
                port: process.env.REDIS_PORT || 6379,
                password: process.env.REDIS_PASSWORD || undefined,
                ...redisOptions
            });
        }
        redisClient.on('ready', () => {
            redisReady = true;
            console.log('Rate limiter: Redis ready');
        });
        redisClient.on('end', () => {
            redisReady = false;
            console.log('Rate limiter: Redis connection closed');
        });
        redisClient.on('error', (err) => console.error('Redis error', err));
        useRedis = true;
        console.log('Rate limiter: using Redis store');
    } catch (err) {
        console.error('Rate limiter: Redis init failed, falling back to memory', err);
        useRedis = false;
    }
} else {
    console.log('Rate limiter: no REDIS configured, using in-memory store (not for multi-instance prod)');
}

function createLimiter(points, duration, keyPrefix, blockDuration = 0) {
    const memoryLimiter = new RateLimiterMemory({ points, duration, blockDuration });

    if (useRedis && redisClient) {
        const redisLimiter = new RateLimiterRedis({
            storeClient: redisClient,
            points,
            duration,
            blockDuration,
            keyPrefix: keyPrefix || 'rl'
        });
        return { memoryLimiter, redisLimiter };
    }

    return { memoryLimiter, redisLimiter: null };
}

function getActiveLimiter(limiterPair) {
    if (limiterPair.redisLimiter && redisReady) return limiterPair.redisLimiter;
    return limiterPair.memoryLimiter;
}

async function consumeLimiter(limiterPair, key) {
    const limiter = getActiveLimiter(limiterPair);
    return limiter.consume(key);
}

async function getLimiterState(limiterPair, key) {
    const limiter = getActiveLimiter(limiterPair);
    return limiter.get(key);
}

// sensible defaults (tunable via env later)
const globalLimiter = createLimiter(200, 15 * 60, 'global'); // 200 requests / 15min per IP
const apiLimiter = createLimiter(300, 15 * 60, 'api'); // 300 req / 15min
const authIpLimiter = createLimiter(5, 15 * 60, 'auth_ip'); // 5 req / 15min per IP for auth endpoints
const authAccountLimiter = createLimiter(5, 15 * 60, 'auth_account', 15 * 60); // 5 failed logins / 15min per account
const withdrawalLimiter = createLimiter(5, 60 * 60, 'withdrawal'); // 5 / hour per user
const p2pLimiter = createLimiter(10, 60 * 60, 'p2p'); // 10 / hour per user
const transactionLimiter = createLimiter(20, 60 * 60, 'transaction'); // 20 / hour per user
const claimsLimiter = createLimiter(15, 60 * 60, 'claims'); // 15 claims / hour per user (daily profits, bonuses, etc)
const otpLimiter = createLimiter(10, 15 * 60, 'otp'); // 10 OTP attempts / 15min per IP

function middlewareFromLimiter(limiterPair, keyFn) {
    return async (req, res, next) => {
        // allow health checks and static
        if (req.path === '/health' || req.path.startsWith('/public') || req.path === '/') return next();

        const key = keyFn ? keyFn(req) : req.ip;
        try {
            await consumeLimiter(limiterPair, key);
            return next();
        } catch (rej) {
            if (!rej || typeof rej.msBeforeNext !== 'number') {
                console.error('Rate limiter error', rej);
                return next();
            }
            const retrySecs = Math.ceil((rej.msBeforeNext || 0) / 1000) || 1;
            res.set('Retry-After', String(retrySecs));
            return res.status(429).json({ success: false, message: 'Too many requests. Try again later.', retryAfter: retrySecs });
        }
    };
}

module.exports = {
    redisClient,
    // middlewares
    globalRateLimiterMiddleware: middlewareFromLimiter(globalLimiter, null),
    apiRateLimiterMiddleware: middlewareFromLimiter(apiLimiter, null),
    authIpLimiterMiddleware: middlewareFromLimiter(authIpLimiter, null),
    withdrawalLimiterMiddleware: middlewareFromLimiter(withdrawalLimiter, (req) => req.user?.id || req.ip),
    p2pLimiterMiddleware: middlewareFromLimiter(p2pLimiter, (req) => req.user?.id || req.ip),
    transactionLimiterMiddleware: middlewareFromLimiter(transactionLimiter, (req) => req.user?.id || req.ip),
    claimsLimiterMiddleware: middlewareFromLimiter(claimsLimiter, (req) => req.user?.id || req.ip),
    otpLimiterMiddleware: middlewareFromLimiter(otpLimiter, null),

    // helpers for manual consumption (e.g., count only on failed login)
    consumeAuthIp: async (req) => consumeLimiter(authIpLimiter, req.ip),
    consumeAuthAccount: async (email) => consumeLimiter(authAccountLimiter, `email:${(email||'').toLowerCase()}`),
    getAuthAccountRemaining: async (email) => {
        try {
            const res = await getLimiterState(authAccountLimiter, `email:${(email||'').toLowerCase()}`);
            return res || null;
        } catch (e) {
            return null;
        }
    }
};
