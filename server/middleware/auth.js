/**
 * Authentication and signature verification middleware
 */

const crypto = require('../services/crypto');

const auth = {
    /**
     * Verify cryptographic signature middleware
     */
    verifySignature: async (req, res, next) => {
        try {
            const { signature, publicKey, timestamp, ...data } = req.body;

            if (!signature || !publicKey || !timestamp) {
                return res.status(400).json({
                    error: 'Missing required authentication fields'
                });
            }

            // Check timestamp (reject requests older than 5 minutes)
            const now = Date.now();
            const maxAge = 5 * 60 * 1000; // 5 minutes
            
            if (now - timestamp > maxAge) {
                return res.status(400).json({
                    error: 'Request timestamp too old'
                });
            }

            if (timestamp > now + 60000) { // Allow 1 minute clock skew
                return res.status(400).json({
                    error: 'Request timestamp from future'
                });
            }

            // Construct message based on request type
            let message;
            if (req.path.includes('/threads') && req.method === 'POST') {
                // Thread creation
                message = `${data.title}|${data.content}|${timestamp}`;
            } else if (req.path.includes('/posts') && req.method === 'POST') {
                // Post creation
                message = `${data.content}|${data.threadId}|${timestamp}`;
            } else {
                return res.status(400).json({
                    error: 'Unsupported request type for signature verification'
                });
            }

            // Verify signature
            const isValid = await crypto.verifySignature(message, signature, publicKey);
            
            if (!isValid) {
                return res.status(401).json({
                    error: 'Invalid signature'
                });
            }

            // Add verified data to request
            req.auth = {
                publicKey,
                timestamp,
                verified: true
            };

            next();

        } catch (error) {
            console.error('Signature verification error:', error);
            res.status(500).json({
                error: 'Authentication system error'
            });
        }
    },

    /**
     * Rate limiting based on public key
     */
    rateLimitByKey: (windowMs = 60000, maxRequests = 5) => {
        const keyLimits = new Map();

        return (req, res, next) => {
            const publicKey = req.auth?.publicKey || req.body?.publicKey;
            
            if (!publicKey) {
                return next();
            }

            const now = Date.now();
            const keyData = keyLimits.get(publicKey) || { requests: [], firstRequest: now };

            // Remove old requests outside the window
            keyData.requests = keyData.requests.filter(time => now - time < windowMs);

            if (keyData.requests.length >= maxRequests) {
                return res.status(429).json({
                    error: 'Too many requests from this identity'
                });
            }

            keyData.requests.push(now);
            keyLimits.set(publicKey, keyData);

            // Clean up old entries periodically
            if (keyLimits.size > 10000) {
                const cutoff = now - windowMs * 2;
                for (const [key, data] of keyLimits.entries()) {
                    if (data.firstRequest < cutoff && data.requests.length === 0) {
                        keyLimits.delete(key);
                    }
                }
            }

            next();
        };
    },

    /**
     * Validate public key format
     */
    validatePublicKey: (req, res, next) => {
        const { publicKey } = req.body;

        if (!publicKey) {
            return res.status(400).json({
                error: 'Public key is required'
            });
        }

        // Check if it's a valid hex string
        if (!/^[0-9a-fA-F]+$/.test(publicKey)) {
            return res.status(400).json({
                error: 'Invalid public key format'
            });
        }

        // Check expected length for P-256 keys (65 bytes uncompressed = 130 hex chars)
        if (publicKey.length !== 130) {
            return res.status(400).json({
                error: 'Invalid public key length'
            });
        }

        next();
    },

    /**
     * Generate anonymous identifier from public key
     */
    generateAnonymousId: (publicKey) => {
        const crypto = require('crypto');
        
        // Create a consistent but anonymous identifier
        const hash = crypto.createHash('sha256').update(publicKey).digest('hex');
        return hash.substring(0, 8);
    },

    /**
     * Middleware to add anonymous ID to request
     */
    addAnonymousId: (req, res, next) => {
        const publicKey = req.auth?.publicKey || req.body?.publicKey;
        
        if (publicKey) {
            req.anonymousId = auth.generateAnonymousId(publicKey);
        }

        next();
    },

    /**
     * Check for duplicate content (prevent spam)
     */
    preventDuplicateContent: (windowMs = 60000) => {
        const contentHashes = new Map();

        return (req, res, next) => {
            const { content, title } = req.body;
            const publicKey = req.auth?.publicKey;

            if (!content || !publicKey) {
                return next();
            }

            const crypto = require('crypto');
            const contentToHash = title ? `${title}|${content}` : content;
            const contentHash = crypto.createHash('sha256').update(contentToHash).digest('hex');
            const key = `${publicKey}:${contentHash}`;

            const now = Date.now();
            const lastPost = contentHashes.get(key);

            if (lastPost && now - lastPost < windowMs) {
                return res.status(429).json({
                    error: 'Duplicate content detected, please wait before posting again'
                });
            }

            contentHashes.set(key, now);

            // Clean up old entries
            if (contentHashes.size > 1000) {
                const cutoff = now - windowMs;
                for (const [hashKey, timestamp] of contentHashes.entries()) {
                    if (timestamp < cutoff) {
                        contentHashes.delete(hashKey);
                    }
                }
            }

            next();
        };
    }
};

module.exports = auth;
