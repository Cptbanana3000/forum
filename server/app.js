/**
 * Main Express server for the anonymous forum
 */

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');

// Import services and middleware
const database = require('./services/database');
const security = require('./config/security');
const crawlerBlocker = require('./middleware/crawler-blocker');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize app locals
app.locals.blockedIPs = new Set();

/**
 * Initialize the application
 */
async function initializeApp() {
    try {
        // Initialize database
        await database.init();
        console.log('Database initialized');

        // Setup middleware
        setupMiddleware();
        
        // Setup routes
        setupRoutes();
        
        // Start server
        app.listen(PORT, () => {
            console.log(`🚀 Anonymous Forum running on port ${PORT}`);
            console.log(`📍 http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error('Failed to initialize application:', error);
        process.exit(1);
    }
}

/**
 * Setup middleware
 */
function setupMiddleware() {
    // Trust proxy (for rate limiting and IP detection)
    app.set('trust proxy', 1);

    // Security headers
    app.use(helmet({
        contentSecurityPolicy: false, // We handle this in our security config
        crossOriginEmbedderPolicy: false
    }));

    // Compression
    app.use(compression());

    // CORS (restrictive)
    app.use(cors({
        origin: false, // No cross-origin requests
        optionsSuccessStatus: 200
    }));

    // Custom security headers
    app.use(security.securityHeaders);

    // Block crawlers and bots
    app.use(crawlerBlocker.checkBlockList);
    app.use(crawlerBlocker.blockCrawlers);
    app.use(crawlerBlocker.blockCrawlerPaths);
    app.use(crawlerBlocker.handleHoneypot);

    // Body parsing
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Static files (with security)
    app.use('/css', express.static(path.join(__dirname, '../public/css'), {
        maxAge: '1d',
        setHeaders: (res) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
        }
    }));

    app.use('/js', express.static(path.join(__dirname, '../public/js'), {
        maxAge: '1d',
        setHeaders: (res) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
        }
    }));

    // Rate limiting
    app.use('/api/', security.rateLimits.api);

    // Request logging (anonymous)
    app.use((req, res, next) => {
        const hashedIP = security.anonymization.hashIP(req.ip);
        console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${hashedIP}`);
        next();
    });
}

/**
 * Setup routes
 */
function setupRoutes() {
    // Special routes
    app.get('/robots.txt', crawlerBlocker.generateRobotsTxt);

    // API routes
    app.use('/api', apiRoutes);

    // Main pages
    app.get('/', async (req, res) => {
        try {
            const boards = await database.getBoards();
            const stats = await database.getForumStats();
            
            let html = await renderTemplate('board.html', {
                title: 'Anonymous Forum',
                boards: boards,
                stats: stats,
                isIndex: true
            });

            // Add honeypots
            html = crawlerBlocker.addHoneypots(html);
            
            res.send(html);
        } catch (error) {
            console.error('Error rendering index:', error);
            res.status(500).send('Internal Server Error');
        }
    });

    app.get('/board/:board', async (req, res) => {
        try {
            const boardName = req.params.board;
            const page = parseInt(req.query.page) || 1;
            
            const board = await database.getBoardByName(boardName);
            if (!board) {
                return res.status(404).send('Board not found');
            }

            const threads = await database.getThreads(boardName, page, 20);
            
            let html = await renderTemplate('board.html', {
                title: `/${boardName}/ - Anonymous Forum`,
                board: board,
                threads: threads,
                currentPage: page
            });

            html = crawlerBlocker.addHoneypots(html);
            res.send(html);
        } catch (error) {
            console.error('Error rendering board:', error);
            res.status(500).send('Internal Server Error');
        }
    });

    app.get('/thread/:threadId', async (req, res) => {
        try {
            const threadId = parseInt(req.params.threadId);
            
            if (isNaN(threadId)) {
                return res.status(400).send('Invalid thread ID');
            }

            const thread = await database.getThread(threadId);
            if (!thread) {
                return res.status(404).send('Thread not found');
            }

            const posts = await database.getPosts(threadId, 1, 100);
            
            let html = await renderTemplate('thread.html', {
                title: `${thread.title} - Anonymous Forum`,
                thread: thread,
                posts: posts
            });

            html = crawlerBlocker.addHoneypots(html);
            res.send(html);
        } catch (error) {
            console.error('Error rendering thread:', error);
            res.status(500).send('Internal Server Error');
        }
    });

    // 404 handler
    app.use((req, res) => {
        res.status(404).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>404 - Not Found</title>
                <link rel="stylesheet" href="/css/style.css">
                <meta name="robots" content="noindex, nofollow">
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>404</h1>
                        <p class="subtitle">Page not found</p>
                    </div>
                    <div class="nav">
                        <a href="/">← Back to Forum</a>
                    </div>
                </div>
            </body>
            </html>
        `);
    });

    // Error handler
    app.use((error, req, res, next) => {
        console.error('Server error:', error);
        
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>500 - Server Error</title>
                <link rel="stylesheet" href="/css/style.css">
                <meta name="robots" content="noindex, nofollow">
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Server Error</h1>
                        <p class="subtitle">Something went wrong</p>
                    </div>
                    <div class="nav">
                        <a href="/">← Back to Forum</a>
                    </div>
                </div>
            </body>
            </html>
        `);
    });
}

/**
 * Simple template renderer
 */
async function renderTemplate(templateName, data) {
    const fs = require('fs').promises;
    const templatePath = path.join(__dirname, '../views', templateName);
    
    try {
        let template = await fs.readFile(templatePath, 'utf8');
        
        // Simple template variable replacement
        for (const [key, value] of Object.entries(data)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            template = template.replace(regex, typeof value === 'string' ? value : JSON.stringify(value));
        }
        
        return template;
    } catch (error) {
        console.error('Template rendering error:', error);
        throw error;
    }
}

/**
 * Graceful shutdown
 */
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    
    database.close();
    
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    
    database.close();
    
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    
    database.close();
    
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    
    database.close();
    
    process.exit(1);
});

// Initialize and start the application
initializeApp();
