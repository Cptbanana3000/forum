const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { create } = require('express-handlebars');
const fs = require('fs');
const crypto = require('crypto');

const database = require('./services/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure Handlebars
const hbs = create({
    extname: '.html',
    defaultLayout: false,
    partialsDir: path.join(__dirname, '../views/partials')
});

app.engine('html', hbs.engine);
app.set('view engine', 'html');
app.set('views', path.join(__dirname, '../views'));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Rate limiting - relaxed for testing
const createRateLimit = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // limit each IP to 10 requests per windowMs
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false
});

const postRateLimit = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 20, // limit each IP to 20 requests per windowMs
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false
});

// Anti-crawler middleware
app.use((req, res, next) => {
    const userAgent = req.get('User-Agent') || '';
    const suspiciousAgents = [
        'bot', 'crawler', 'spider', 'scraper', 'wget', 'curl'
    ];
    
    const isSuspicious = suspiciousAgents.some(agent => 
        userAgent.toLowerCase().includes(agent)
    );
    
    if (isSuspicious) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    next();
});

// Signature validation middleware
const validateSignature = (req, res, next) => {
    const { content, publicKey, signature } = req.body;
    
    if (!content || !publicKey || !signature) {
        return res.status(400).json({ 
            error: 'Missing required fields: content, publicKey, signature' 
        });
    }
    
    try {
        // Validate public key format
        if (!publicKey.startsWith('-----BEGIN PUBLIC KEY-----') || 
            !publicKey.endsWith('-----END PUBLIC KEY-----')) {
            return res.status(400).json({ error: 'Invalid public key format' });
        }
        
        // Verify signature
        const verify = crypto.createVerify('SHA256');
        verify.update(content);
        const isValid = verify.verify(publicKey, signature, 'base64');
        
        if (!isValid) {
            return res.status(400).json({ error: 'Invalid signature' });
        }
        
        next();
    } catch (error) {
        console.error('Signature validation error:', error);
        return res.status(400).json({ error: 'Signature validation failed' });
    }
};

// Routes
app.get('/', async (req, res) => {
    try {
        const threads = await database.getThreads('b'); // Default to /b/ board
        
        res.render('board', {
            boardId: 'b',
            boardName: 'Random',
            threads: threads.map(thread => ({
                ...thread,
                replies: thread.replies || 0,
                lastReply: thread.last_reply || thread.created_at
            }))
        });
    } catch (error) {
        console.error('Error loading home page:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/board/:boardId', async (req, res) => {
    try {
        const { boardId } = req.params;
        const threads = await database.getThreads(boardId);
        
        res.render('board', {
            boardId,
            boardName: boardId === 'b' ? 'Random' : boardId.toUpperCase(),
            threads: threads.map(thread => ({
                ...thread,
                replies: thread.replies || 0,
                lastReply: thread.last_reply || thread.created_at
            }))
        });
    } catch (error) {
        console.error('Error loading board:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/thread/:threadId', async (req, res) => {
    try {
        const { threadId } = req.params;
        const thread = await database.getThread(threadId);
        const posts = await database.getPosts(threadId);
        
        if (!thread) {
            return res.status(404).send('Thread not found');
        }
        
        res.render('thread', {
            thread,
            posts
        });
    } catch (error) {
        console.error('Error loading thread:', error);
        res.status(500).send('Internal Server Error');
    }
});

// API Routes
const apiRoutes = require('./routes/api');
app.use('/api', createRateLimit, postRateLimit, validateSignature, apiRoutes);

// Cleanup scheduler - runs every 5 minutes
const cleanupInterval = setInterval(async () => {
    try {
        const deletedCount = await database.cleanupExpiredThreads();
        if (deletedCount > 0) {
            console.log(`Cleaned up ${deletedCount} expired threads`);
        }
    } catch (error) {
        console.error('Error during cleanup:', error);
    }
}, 5 * 60 * 1000); // 5 minutes

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    clearInterval(cleanupInterval);
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    clearInterval(cleanupInterval);
    process.exit(0);
});

app.listen(PORT, async () => {
    console.log(`Forum server running on port ${PORT}`);
    console.log('Cleanup scheduler started - checking every 5 minutes');
    
    // Initialize database
    try {
        await database.init();
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Failed to initialize database:', error);
        process.exit(1);
    }
});
