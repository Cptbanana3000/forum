const express = require('express');
const path = require('path');
const { create } = require('express-handlebars');
const database = require('./services/database');
const apiRoutes = require('./routes/api');
const security = require('./config/security');
const crawlerBlocker = require('./middleware/crawler-blocker');

const app = express();
const PORT = process.env.PORT || 3000;

// Correctly configure Handlebars
const hbs = create({
    extname: '.html',
    defaultLayout: false,
    helpers: {
        // You can add custom helpers here if needed
    }
});

app.engine('html', hbs.engine);
app.set('view engine', 'html');
app.set('views', path.join(__dirname, '../views'));

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.use(security.securityHeaders);
app.use(crawlerBlocker.blockCrawlers);

// --- Routes ---
app.use('/api', apiRoutes);

// Home page (shows all boards)
app.get('/', async (req, res) => {
    try {
        const boards = await database.getBoards();
        const stats = await database.getForumStats();
        
        // Use res.render() to correctly process the template
        res.render('board', {
            title: 'Freedom',
            isIndex: true, // This will trigger the {{#if isIndex}} block
            boards: boards,
            stats: stats
        });
    } catch (error) {
        console.error('Error loading home page:', error);
        res.status(500).send('Server Error');
    }
});

// Board page (shows threads for a specific board)
app.get('/board/:boardName', async (req, res) => {
    try {
        const { boardName } = req.params;
        const board = await database.getBoardByName(boardName);

        if (!board) {
            return res.status(404).send('Board not found');
        }

        const threads = await database.getThreads(boardName);
        
        // Use res.render() here as well
        res.render('board', {
            title: `/${board.name}/ - ${board.description}`,
            board: board, // This will trigger the {{#if board}} block
            threads: threads
        });
    } catch (error) {
        console.error(`Error loading board ${req.params.boardName}:`, error);
        res.status(500).send('Server Error');
    }
});

// Thread page (shows posts in a thread)
app.get('/thread/:threadId', async (req, res) => {
    try {
        const threadId = parseInt(req.params.threadId);
        const thread = await database.getThread(threadId);

        if (!thread) {
            return res.status(404).send('Thread not found');
        }

        const posts = await database.getPosts(threadId);
        
        // And use res.render() here
        res.render('thread', {
            title: thread.title,
            thread: thread,
            posts: posts
        });
    } catch (error) {
        console.error(`Error loading thread ${req.params.threadId}:`, error);
        res.status(500).send('Server Error');
    }
});


// Start Server and Database
async function startServer() {
    try {
        await database.init();
        app.listen(PORT, () => {
            console.log(`🚀 Forum is live at http://localhost:${PORT}`);
        });
        
        // Start cleanup job for self-destructing threads
        setInterval(database.cleanupExpiredThreads, 5 * 60 * 1000); // Check every 5 minutes
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();