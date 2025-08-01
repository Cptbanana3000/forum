const express = require('express');
const router = express.Router();
const database = require('../services/database');
const auth = require('../middleware/auth');
const security = require('../config/security');

// POST /api/threads - Create a new thread
router.post('/threads', 
    security.rateLimits.threadCreation,
    auth.verifySignature,
    async (req, res) => {
        try {
            const { board, title, content, selfDestruct } = req.body;
            const { publicKey, timestamp } = req.auth;

            // Validate self-destruct timer (value is in minutes)
            let selfDestructMinutes = null;
            if (selfDestruct && selfDestruct !== '') {
                selfDestructMinutes = parseInt(selfDestruct, 10);
                if (isNaN(selfDestructMinutes) || selfDestructMinutes < 0) {
                    return res.status(400).json({ error: 'Invalid self-destruct timer value.' });
                }
            }

            const threadId = await database.createThread({
                board,
                title,
                content,
                publicKey,
                timestamp,
                signatureValid: true,
                selfDestructMinutes // Pass the new value to the database
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

// POST /api/posts - Create a new post
router.post('/posts',
    security.rateLimits.posting,
    auth.verifySignature,
    async (req, res) => {
        try {
            const { threadId, content } = req.body;
            const { publicKey, timestamp } = req.auth;

            const postId = await database.createPost({
                threadId: parseInt(threadId, 10),
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

// --- Other API routes (getters) ---
router.get('/boards', async (req, res) => res.json(await database.getBoards()));
router.get('/boards/:board/threads', async (req, res) => res.json(await database.getThreads(req.params.board)));
router.get('/threads/:threadId', async (req, res) => res.json(await database.getThread(req.params.threadId)));
router.get('/threads/:threadId/posts', async (req, res) => res.json(await database.getPosts(req.params.threadId)));
router.get('/stats', async (req, res) => res.json(await database.getForumStats()));

module.exports = router;
