/**
 * Database service for the anonymous forum
 * Handles all SQLite database interactions
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class DatabaseService {
    constructor() {
        this.db = null;
        this.dbPath = path.join(__dirname, '../../data/forum.db');
        this.isInitialized = false;
    }

    /**
     * Initialize database connection and create tables
     */
    async init() {
        if (this.isInitialized) return;

        try {
            const dataDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            this.db = new sqlite3.Database(this.dbPath);
            await this.run('PRAGMA foreign_keys = ON');
            await this.createTables();
            this.isInitialized = true;
            console.log('Database initialized successfully');
        } catch (error) {
            console.error('Database initialization failed:', error);
            throw error;
        }
    }

    /**
     * Create database tables and run migrations
     */
    async createTables() {
        // Main schema for threads and posts
        await this.run(`
            CREATE TABLE IF NOT EXISTS threads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                board_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                public_key TEXT NOT NULL,
                signature_valid BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                post_count INTEGER DEFAULT 0,
                self_destruct_at DATETIME,
                FOREIGN KEY (board_id) REFERENCES boards (id)
            )`);
        
        await this.run(`
            CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                thread_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                public_key TEXT NOT NULL,
                signature_valid BOOLEAN DEFAULT 0,
                post_number INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (thread_id) REFERENCES threads (id) ON DELETE CASCADE
            )`);

        await this.run(`CREATE TABLE IF NOT EXISTS boards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

        // Indexes for performance
        await this.run(`CREATE INDEX IF NOT EXISTS idx_threads_board_id ON threads (board_id)`);
        await this.run(`CREATE INDEX IF NOT EXISTS idx_threads_self_destruct ON threads (self_destruct_at)`);
        await this.run(`CREATE INDEX IF NOT EXISTS idx_posts_thread_id ON posts (thread_id)`);

        await this.createDefaultBoards();
    }
    
    /**
     * Create default boards if they don't exist
     */
    async createDefaultBoards() {
        const defaultBoards = [
            { name: 'b', description: 'Random' },
            { name: 'g', description: 'Technology' },
            { name: 'pol', description: 'Politics' },
        ];
        for (const board of defaultBoards) {
            await this.run('INSERT OR IGNORE INTO boards (name, description) VALUES (?, ?)', [board.name, board.description]);
        }
    }

    /**
     * Create a new thread with an optional self-destruct timer
     */
    async createThread(data) {
        const { board, title, content, publicKey, timestamp, signatureValid, selfDestructMinutes } = data;
        
        const boardRow = await this.getBoardByName(board);
        if (!boardRow) throw new Error('Board not found');

        let selfDestructAt = null;
        if (selfDestructMinutes && selfDestructMinutes > 0) {
            selfDestructAt = new Date(timestamp + (selfDestructMinutes * 60 * 1000));
        }

        const sql = `
            INSERT INTO threads (board_id, title, content, public_key, signature_valid, created_at, self_destruct_at)
            VALUES (?, ?, ?, ?, ?, datetime(?, 'unixepoch'), ?)
        `;
        
        const result = await this.run(sql, [
            boardRow.id, title, content, publicKey, signatureValid ? 1 : 0, timestamp / 1000, selfDestructAt
        ]);
        
        return result.id;
    }
    
    /**
     * The cleanup job: Deletes all threads that have passed their self-destruct time
     */
    async cleanupExpiredThreads() {
        try {
            const now = new Date().toISOString();
            const result = await this.run(
                'DELETE FROM threads WHERE self_destruct_at IS NOT NULL AND self_destruct_at <= ?',
                [now]
            );
            
            if (result.changes > 0) {
                console.log(`[CLEANUP] Self-destructed ${result.changes} expired thread(s).`);
            }
            return result.changes;
        } catch (error) {
            console.error('[CLEANUP] Error cleaning up expired threads:', error);
            return 0;
        }
    }

    // --- Other Database Functions (getters, post creation, etc.) ---

    run(sql, params = []) { return new Promise((resolve, reject) => this.db.run(sql, params, function(err) { if (err) reject(err); else resolve({ id: this.lastID, changes: this.changes }); })); }
    get(sql, params = []) { return new Promise((resolve, reject) => this.db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))); }
    all(sql, params = []) { return new Promise((resolve, reject) => this.db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows))); }
    async getBoards() { return this.all('SELECT * FROM boards ORDER BY name'); }
    async getBoardByName(name) { return this.get('SELECT * FROM boards WHERE name = ?', [name]); }
    async getThreads(boardName) { return this.all('SELECT *, substr(public_key, 1, 8) as author_id FROM threads WHERE board_id = (SELECT id FROM boards WHERE name = ?) ORDER BY updated_at DESC', [boardName]); }
    async getThread(threadId) { return this.get('SELECT *, substr(public_key, 1, 8) as author_id FROM threads WHERE id = ?', [threadId]); }
    async getPosts(threadId) { return this.all('SELECT *, substr(public_key, 1, 8) as author_id FROM posts WHERE thread_id = ? ORDER BY created_at ASC', [threadId]); }
    async createPost(data) {
        const { threadId, content, publicKey, timestamp, signatureValid } = data;
        const result = await this.run('INSERT INTO posts (thread_id, content, public_key, signature_valid, created_at) VALUES (?, ?, ?, ?, datetime(?, "unixepoch"))', [threadId, content, publicKey, signatureValid ? 1 : 0, timestamp / 1000]);
        await this.run('UPDATE threads SET updated_at = CURRENT_TIMESTAMP, post_count = post_count + 1 WHERE id = ?', [threadId]);
        return result.id;
    }
    async getForumStats() { return this.get(`SELECT (SELECT COUNT(*) FROM boards) as board_count, (SELECT COUNT(*) FROM threads) as thread_count, (SELECT COUNT(*) FROM posts) as post_count, (SELECT COUNT(DISTINCT public_key) FROM (SELECT public_key FROM threads UNION SELECT public_key FROM posts)) as unique_users`); }
}

module.exports = new DatabaseService();
