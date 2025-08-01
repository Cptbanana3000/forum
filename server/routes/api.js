/**
 * API routes for the anonymous forum
 * Handles all endpoints for posts, threads, and boards
 */

const express = require('express');
const router = express.Router();

const database = require('../services/database');
const crypto = require('../services/crypto');
const auth = require('../middleware/auth');
const security = require('../config/security');

// Apply authentication middleware to all routes
router.use(auth.validatePublicKey);
router.use(auth.addAnonymousId);

/**
 * GET /api/boards
 * Get list of all boards
 */
router.get('/boards', async (req, res) => {
    try {
        const boards = await database.getBoards();
        res.json(boards);
    } catch (error) {
        console.error('Error fetching boards:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/boards/:board/threads
 * Get threads for a specific board
 */
router.get('/boards/:board/threads', async (req, res) => {
    try {
        const { board } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        const boardValidation = security.validation.validateBoard(board);
        if (!boardValidation.valid) {
            return res.status(400).json({ error: boardValidation.error });
        }

        const threads = await database.getThreads(board, page, limit);
        res.json(threads);
    } catch (error) {
        console.error('Error fetching threads:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/threads
 * Create a new thread
 */
router.post('/threads', 
    security.rateLimits.threadCreation,
    auth.verifySignature,
    auth.rateLimitByKey(5 * 60 * 1000, 2), // 2 threads per 5 minutes per key
    auth.preventDuplicateContent(5 * 60 * 1000), // Prevent duplicate threads for 5 minutes
    async (req, res) => {
        try {
            const { board, title, content } = req.body;
            const { publicKey, timestamp } = req.auth;

            // Validate input
            const boardValidation = security.validation.validateBoard(board);
            if (!boardValidation.valid) {
                return res.status(400).json({ error: boardValidation.error });
            }

            const titleValidation = security.validation.validateTitle(title);
            if (!titleValidation.valid) {
                return res.status(400).json({ error: titleValidation.error });
            }

            const contentValidation = security.validation.validateContent(content);
            if (!contentValidation.valid) {
                return res.status(400).json({ error: contentValidation.error });
            }

            // Create thread
            const threadId = await database.createThread({
                board,
                title,
                content,
                publicKey,
                timestamp,
                signatureValid: true
            });

            res.status(201).json({ 
                threadId,
                message: 'Thread created successfully'
            });

        } catch (error) {
            console.error('Error creating thread:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

/**
 * GET /api/threads/:threadId
 * Get a specific thread
 */
router.get('/threads/:threadId', async (req, res) => {
    try {
        const threadId = parseInt(req.params.threadId);
        
        if (isNaN(threadId)) {
            return res.status(400).json({ error: 'Invalid thread ID' });
        }

        const thread = await database.getThread(threadId);
        
        if (!thread) {
            return res.status(404).json({ error: 'Thread not found' });
        }

        res.json(thread);
    } catch (error) {
        console.error('Error fetching thread:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/threads/:threadId/posts
 * Get posts for a specific thread
 */
router.get('/threads/:threadId/posts', async (req, res) => {
    try {
        const threadId = parseInt(req.params.threadId);
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;

        if (isNaN(threadId)) {
            return res.status(400).json({ error: 'Invalid thread ID' });
        }

        const posts = await database.getPosts(threadId, page, limit);
        res.json(posts);
    } catch (error) {
        console.error('Error fetching posts:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/posts
 * Create a new post
 */
router.post('/posts',
    security.rateLimits.posting,
    auth.verifySignature,
    auth.rateLimitByKey(60 * 1000, 10), // 10 posts per minute per key
    auth.preventDuplicateContent(30 * 1000), // Prevent duplicate posts for 30 seconds
    async (req, res) => {
        try {
            const { threadId, content } = req.body;
            const { publicKey, timestamp } = req.auth;

            // Validate input
            const threadIdNum = parseInt(threadId);
            if (isNaN(threadIdNum)) {
                return res.status(400).json({ error: 'Invalid thread ID' });
            }

            const contentValidation = security.validation.validateContent(content);
            if (!contentValidation.valid) {
                return res.status(400).json({ error: contentValidation.error });
            }

            // Check if thread exists
            const thread = await database.getThread(threadIdNum);
            if (!thread) {
                return res.status(404).json({ error: 'Thread not found' });
            }

            // Create post
            const postId = await database.createPost({
                threadId: threadIdNum,
                content,
                publicKey,
                timestamp,
                signatureValid: true
            });

            res.status(201).json({ 
                postId,
                message: 'Post created successfully'
            });

        } catch (error) {
            console.error('Error creating post:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

/**
 * GET /api/stats
 * Get forum statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await database.getForumStats();
        res.json(stats);
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/recent
 * Get recent activity across all boards
 */
router.get('/recent', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const recent = await database.getRecentActivity(limit);
        res.json(recent);
    } catch (error) {
        console.error('Error fetching recent activity:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/verify
 * Verify a signature (for testing purposes)
 */
router.post('/verify', async (req, res) => {
    try {
        const { message, signature, publicKey } = req.body;

        if (!message || !signature || !publicKey) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const isValid = await crypto.verifySignature(message, signature, publicKey);
        
        res.json({ 
            valid: isValid,
            publicKeyId: publicKey.substring(0, 8)
        });
    } catch (error) {
        console.error('Error verifying signature:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Error handler for API routes
 */
router.use((error, req, res, next) => {
    console.error('API Error:', error);
    
    if (error.name === 'ValidationError') {
        return res.status(400).json({ error: error.message });
    }
    
    if (error.name === 'UnauthorizedError') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
});

module.exports = router;
