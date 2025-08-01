/**
 * Security configurations for the anonymous forum
 * Handles rate limiting, security headers, and other protective measures
 */

const rateLimit = require('express-rate-limit');

const security = {
    /**
     * Rate limiting configurations
     */
    rateLimits: {
        // General API rate limit
        api: rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // Limit each IP to 100 requests per windowMs
            message: {
                error: 'Too many requests from this IP, please try again later.'
            },
            standardHeaders: true,
            legacyHeaders: false,
        }),

        // Stricter rate limit for posting
        posting: rateLimit({
            windowMs: 60 * 1000, // 1 minute
            max: 20, // Limit each IP to 20 posts per minute (increased for testing)
            message: {
                error: 'Too many posts, please slow down.'
            },
            standardHeaders: true,
            legacyHeaders: false,
        }),

        // Very strict rate limit for thread creation
        threadCreation: rateLimit({
            windowMs: 60 * 1000, // 1 minute (reduced from 5 minutes)
            max: 10, // Limit each IP to 10 threads per minute (increased for testing)
            message: {
                error: 'Too many threads created, please wait before creating another.'
            },
            standardHeaders: true,
            legacyHeaders: false,
        })
    },

    /**
     * Security headers middleware
     */
    securityHeaders: (req, res, next) => {
        // Prevent clickjacking
        res.setHeader('X-Frame-Options', 'DENY');
        
        // Prevent MIME type sniffing
        res.setHeader('X-Content-Type-Options', 'nosniff');
        
        // Enable XSS protection
        res.setHeader('X-XSS-Protection', '1; mode=block');
        
        // Strict transport security (HTTPS only)
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        
        // Content Security Policy
        res.setHeader('Content-Security-Policy', [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'", // Allow inline scripts for crypto
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "connect-src 'self'",
            "font-src 'self'",
            "object-src 'none'",
            "media-src 'none'",
            "frame-src 'none'"
        ].join('; '));
        
        // Referrer policy
        res.setHeader('Referrer-Policy', 'no-referrer');
        
        // Permissions policy
        res.setHeader('Permissions-Policy', [
            'geolocation=()',
            'microphone=()',
            'camera=()',
            'payment=()',
            'usb=()',
            'magnetometer=()',
            'gyroscope=()',
            'accelerometer=()'
        ].join(', '));

        next();
    },

    /**
     * Content validation
     */
    validation: {
        // Maximum content lengths
        maxTitleLength: 200,
        maxContentLength: 10000,
        maxBoardNameLength: 50,

        // Forbidden patterns (regex)
        forbiddenPatterns: [
            /javascript:/gi,
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            /on\w+\s*=/gi, // Event handlers
            /data:text\/html/gi,
            /vbscript:/gi
        ],

        // Validate post content
        validateContent: (content) => {
            if (!content || typeof content !== 'string') {
                return { valid: false, error: 'Content is required' };
            }

            if (content.length > security.validation.maxContentLength) {
                return { valid: false, error: 'Content too long' };
            }

            // Check for forbidden patterns
            for (const pattern of security.validation.forbiddenPatterns) {
                if (pattern.test(content)) {
                    return { valid: false, error: 'Content contains forbidden elements' };
                }
            }

            return { valid: true };
        },

        // Validate thread title
        validateTitle: (title) => {
            if (!title || typeof title !== 'string') {
                return { valid: false, error: 'Title is required' };
            }

            if (title.length > security.validation.maxTitleLength) {
                return { valid: false, error: 'Title too long' };
            }

            // Check for forbidden patterns
            for (const pattern of security.validation.forbiddenPatterns) {
                if (pattern.test(title)) {
                    return { valid: false, error: 'Title contains forbidden elements' };
                }
            }

            return { valid: true };
        },

        // Validate board name
        validateBoard: (board) => {
            if (!board || typeof board !== 'string') {
                return { valid: false, error: 'Board is required' };
            }

            if (board.length > security.validation.maxBoardNameLength) {
                return { valid: false, error: 'Board name too long' };
            }

            // Only allow alphanumeric and basic punctuation
            if (!/^[a-zA-Z0-9_\-\s]+$/.test(board)) {
                return { valid: false, error: 'Invalid board name format' };
            }

            return { valid: true };
        }
    },

    /**
     * IP and request filtering
     */
    filtering: {
        // Known bot/crawler user agents
        botPatterns: [
            /googlebot/i,
            /bingbot/i,
            /slurp/i,
            /duckduckbot/i,
            /baiduspider/i,
            /yandexbot/i,
            /facebookexternalhit/i,
            /twitterbot/i,
            /linkedinbot/i,
            /whatsapp/i,
            /telegram/i,
            /crawler/i,
            /spider/i,
            /scraper/i,
            /bot/i
        ],

        // Check if request is from a bot
        isBot: (userAgent) => {
            if (!userAgent) return true; // No user agent is suspicious

            return security.filtering.botPatterns.some(pattern => 
                pattern.test(userAgent)
            );
        },

        // Suspicious request patterns
        suspiciousPatterns: [
            /\.\./g, // Directory traversal
            /script/gi,
            /union.*select/gi, // SQL injection
            /concat\(/gi,
            /char\(/gi,
            /0x[0-9a-f]/gi // Hex encoding
        ],

        // Check for suspicious requests
        isSuspicious: (url, body) => {
            const content = url + JSON.stringify(body || {});
            
            return security.filtering.suspiciousPatterns.some(pattern =>
                pattern.test(content)
            );
        }
    },

    /**
     * Anonymization helpers
     */
    anonymization: {
        // Hash IP address for logging (one-way)
        hashIP: (ip) => {
            const crypto = require('crypto');
            return crypto.createHash('sha256').update(ip + 'salt_' + new Date().toDateString()).digest('hex').substring(0, 16);
        },

        // Generate session-based identifier
        generateSessionId: () => {
            const crypto = require('crypto');
            return crypto.randomBytes(16).toString('hex');
        }
    }
};

module.exports = security;
