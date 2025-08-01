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
            // Ensure data directory exists
            const dataDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            // Create database connection
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Error opening database:', err.message);
                    throw err;
                }
                console.log('Connected to SQLite database');
            });

            // Enable foreign keys
            await this.run('PRAGMA foreign_keys = ON');
            
            // Create tables
            await this.createTables();
            
            this.isInitialized = true;
            console.log('Database initialized successfully');
        } catch (error) {
            console.error('Database initialization failed:', error);
            throw error;
        }
    }

    /**
     * Create database tables
     */
    async createTables() {
        const tables = [
            // Boards table
            `CREATE TABLE IF NOT EXISTS boards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Threads table
            `CREATE TABLE IF NOT EXISTS threads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                board_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                public_key TEXT NOT NULL,
                signature_valid BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                post_count INTEGER DEFAULT 0,
                FOREIGN KEY (board_id) REFERENCES boards (id)
            )`,

            // Posts table
            `CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                thread_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                public_key TEXT NOT NULL,
                signature_valid BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (thread_id) REFERENCES threads (id) ON DELETE CASCADE
            )`,

            // Indexes for performance
            `CREATE INDEX IF NOT EXISTS idx_threads_board_id ON threads (board_id)`,
            `CREATE INDEX IF NOT EXISTS idx_threads_created_at ON threads (created_at DESC)`,
            `CREATE INDEX IF NOT EXISTS idx_posts_thread_id ON posts (thread_id)`,
            `CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at DESC)`,
            `CREATE INDEX IF NOT EXISTS idx_public_key_hash ON threads (substr(public_key, 1, 16))`,
            `CREATE INDEX IF NOT EXISTS idx_posts_public_key_hash ON posts (substr(public_key, 1, 16))`
        ];

        for (const sql of tables) {
            await this.run(sql);
        }

        // Insert default boards
        await this.createDefaultBoards();
    }

    /**
     * Create default boards
     */
    async createDefaultBoards() {
        const defaultBoards = [
            { name: 'general', description: 'General discussion' },
            { name: 'tech', description: 'Technology and programming' },
            { name: 'crypto', description: 'Cryptocurrency and blockchain' },
            { name: 'random', description: 'Random thoughts and topics' }
        ];

        for (const board of defaultBoards) {
            await this.run(
                'INSERT OR IGNORE INTO boards (name, description) VALUES (?, ?)',
                [board.name, board.description]
            );
        }
    }

    /**
     * Execute SQL query that doesn't return data
     */
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    }

    /**
     * Execute SQL query that returns a single row
     */
    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    /**
     * Execute SQL query that returns multiple rows
     */
    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    /**
     * Get all boards
     */
    async getBoards() {
        const sql = `
            SELECT b.*, 
                   COUNT(DISTINCT t.id) as thread_count,
                   COUNT(DISTINCT p.id) as post_count,
                   MAX(COALESCE(p.created_at, t.created_at)) as last_activity
            FROM boards b
            LEFT JOIN threads t ON b.id = t.board_id
            LEFT JOIN posts p ON t.id = p.thread_id
            GROUP BY b.id
            ORDER BY b.name
        `;
        return await this.all(sql);
    }

    /**
     * Get board by name
     */
    async getBoardByName(name) {
        return await this.get('SELECT * FROM boards WHERE name = ?', [name]);
    }

    /**
     * Get threads for a board
     */
    async getThreads(boardName, page = 1, limit = 20) {
        const offset = (page - 1) * limit;
        
        const sql = `
            SELECT t.*, b.name as board_name,
                   COUNT(p.id) as reply_count,
                   MAX(COALESCE(p.created_at, t.created_at)) as last_activity,
                   substr(t.public_key, 1, 8) as author_id
            FROM threads t
            JOIN boards b ON t.board_id = b.id
            LEFT JOIN posts p ON t.id = p.thread_id
            WHERE b.name = ?
            GROUP BY t.id
            ORDER BY last_activity DESC
            LIMIT ? OFFSET ?
        `;
        
        return await this.all(sql, [boardName, limit, offset]);
    }

    /**
     * Get a specific thread
     */
    async getThread(threadId) {
        const sql = `
            SELECT t.*, b.name as board_name,
                   COUNT(p.id) as reply_count,
                   substr(t.public_key, 1, 8) as author_id
            FROM threads t
            JOIN boards b ON t.board_id = b.id
            LEFT JOIN posts p ON t.id = p.thread_id
            WHERE t.id = ?
            GROUP BY t.id
        `;
        
        return await this.get(sql, [threadId]);
    }

    /**
     * Create a new thread
     */
    async createThread(data) {
        const { board, title, content, publicKey, timestamp, signatureValid } = data;
        
        // Get board ID
        const boardRow = await this.getBoardByName(board);
        if (!boardRow) {
            throw new Error('Board not found');
        }

        const sql = `
            INSERT INTO threads (board_id, title, content, public_key, signature_valid, created_at)
            VALUES (?, ?, ?, ?, ?, datetime(?, 'unixepoch', 'subsec'))
        `;
        
        const result = await this.run(sql, [
            boardRow.id, title, content, publicKey, signatureValid ? 1 : 0, timestamp / 1000
        ]);
        
        return result.id;
    }

    /**
     * Get posts for a thread
     */
    async getPosts(threadId, page = 1, limit = 50) {
        const offset = (page - 1) * limit;
        
        const sql = `
            SELECT p.*,
                   substr(p.public_key, 1, 8) as author_id
            FROM posts p
            WHERE p.thread_id = ?
            ORDER BY p.created_at ASC
            LIMIT ? OFFSET ?
        `;
        
        return await this.all(sql, [threadId, limit, offset]);
    }

    /**
     * Create a new post
     */
    async createPost(data) {
        const { threadId, content, publicKey, timestamp, signatureValid } = data;
        
        const sql = `
            INSERT INTO posts (thread_id, content, public_key, signature_valid, created_at)
            VALUES (?, ?, ?, ?, datetime(?, 'unixepoch', 'subsec'))
        `;
        
        const result = await this.run(sql, [
            threadId, content, publicKey, signatureValid ? 1 : 0, timestamp / 1000
        ]);

        // Update thread's updated_at and post_count
        await this.run(`
            UPDATE threads 
            SET updated_at = datetime(?, 'unixepoch', 'subsec'),
                post_count = post_count + 1
            WHERE id = ?
        `, [timestamp / 1000, threadId]);
        
        return result.id;
    }

    /**
     * Get forum statistics
     */
    async getForumStats() {
        const stats = await this.get(`
            SELECT 
                (SELECT COUNT(*) FROM boards) as board_count,
                (SELECT COUNT(*) FROM threads) as thread_count,
                (SELECT COUNT(*) FROM posts) as post_count,
                (SELECT COUNT(DISTINCT substr(public_key, 1, 16)) FROM (
                    SELECT public_key FROM threads 
                    UNION 
                    SELECT public_key FROM posts
                )) as unique_users
        `);
        
        return stats;
    }

    /**
     * Get recent activity across all boards
     */
    async getRecentActivity(limit = 20) {
        const sql = `
            SELECT 'thread' as type, t.id, t.title as title, t.content, 
                   b.name as board_name, t.created_at,
                   substr(t.public_key, 1, 8) as author_id
            FROM threads t
            JOIN boards b ON t.board_id = b.id
            UNION ALL
            SELECT 'post' as type, p.id, t.title as title, p.content,
                   b.name as board_name, p.created_at,
                   substr(p.public_key, 1, 8) as author_id
            FROM posts p
            JOIN threads t ON p.thread_id = t.id
            JOIN boards b ON t.board_id = b.id
            ORDER BY created_at DESC
            LIMIT ?
        `;
        
        return await this.all(sql, [limit]);
    }

    /**
     * Search threads and posts
     */
    async search(query, limit = 50) {
        const searchTerm = `%${query}%`;
        
        const sql = `
            SELECT 'thread' as type, t.id, t.title, t.content,
                   b.name as board_name, t.created_at,
                   substr(t.public_key, 1, 8) as author_id
            FROM threads t
            JOIN boards b ON t.board_id = b.id
            WHERE t.title LIKE ? OR t.content LIKE ?
            UNION ALL
            SELECT 'post' as type, p.id, t.title, p.content,
                   b.name as board_name, p.created_at,
                   substr(p.public_key, 1, 8) as author_id
            FROM posts p
            JOIN threads t ON p.thread_id = t.id
            JOIN boards b ON t.board_id = b.id
            WHERE p.content LIKE ?
            ORDER BY created_at DESC
            LIMIT ?
        `;
        
        return await this.all(sql, [searchTerm, searchTerm, searchTerm, limit]);
    }

    /**
     * Clean up old data (for maintenance)
     */
    async cleanup(olderThanDays = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
        
        // Note: This is optional - forum might want to keep all data
        const result = await this.run(`
            DELETE FROM threads 
            WHERE created_at < datetime(?, 'unixepoch')
            AND post_count = 0
        `, [cutoffDate.getTime() / 1000]);
        
        return result.changes;
    }

    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err.message);
                } else {
                    console.log('Database connection closed');
                }
            });
        }
    }
}

// Create singleton instance
const database = new DatabaseService();

module.exports = database;
