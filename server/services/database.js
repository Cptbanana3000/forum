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
                self_destruct_at DATETIME,
                FOREIGN KEY (board_id) REFERENCES boards (id)
            )`,

            // Posts table
            `CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                thread_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                public_key TEXT NOT NULL,
                signature_valid BOOLEAN DEFAULT 0,
                post_number INTEGER NOT NULL DEFAULT 0,
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

        // Run migrations to ensure schema is up to date
        await this.runMigrations();

        // Insert default boards
        await this.createDefaultBoards();
    }

    /**
     * Run database migrations to update schema
     */
    async runMigrations() {
        try {
            // Check if post_number column exists in posts table
            const tableInfo = await this.all("PRAGMA table_info(posts)");
            const hasPostNumber = tableInfo.some(column => column.name === 'post_number');
            
            if (!hasPostNumber) {
                console.log('Adding post_number column to posts table...');
                await this.run('ALTER TABLE posts ADD COLUMN post_number INTEGER NOT NULL DEFAULT 0');
                
                // Update existing posts with sequential post numbers
                const threads = await this.all('SELECT DISTINCT thread_id FROM posts ORDER BY thread_id');
                for (const thread of threads) {
                    const posts = await this.all(
                        'SELECT id FROM posts WHERE thread_id = ? ORDER BY created_at', 
                        [thread.thread_id]
                    );
                    
                    for (let i = 0; i < posts.length; i++) {
                        await this.run(
                            'UPDATE posts SET post_number = ? WHERE id = ?',
                            [i + 1, posts[i].id]
                        );
                    }
                }
                console.log('Post number migration completed');
            }

            // Check if self_destruct_at column exists in threads table
            const threadsTableInfo = await this.all("PRAGMA table_info(threads)");
            const hasSelfDestruct = threadsTableInfo.some(column => column.name === 'self_destruct_at');
            
            if (!hasSelfDestruct) {
                console.log('Adding self_destruct_at column to threads table...');
                await this.run('ALTER TABLE threads ADD COLUMN self_destruct_at DATETIME');
                console.log('Self-destruct migration completed');
            }
        } catch (error) {
            console.error('Migration error:', error);
            // Don't throw - continue with initialization
        }
    }

    /**
     * Create default boards
     */
    async createDefaultBoards() {
        const defaultBoards = [
            { name: 'b', description: 'Random discussion' },
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
        const { board, title, content, publicKey, timestamp, signatureValid, selfDestructMinutes } = data;
        
        // Get board ID
        const boardRow = await this.getBoardByName(board);
        if (!boardRow) {
            throw new Error('Board not found');
        }

        // Calculate self-destruct time if specified
        let selfDestructAt = null;
        if (selfDestructMinutes && selfDestructMinutes > 0) {
            selfDestructAt = new Date(timestamp + (selfDestructMinutes * 60 * 1000));
        }

        const sql = `
            INSERT INTO threads (board_id, title, content, public_key, signature_valid, created_at, self_destruct_at)
            VALUES (?, ?, ?, ?, ?, datetime(?, 'unixepoch', 'subsec'), ?)
        `;
        
        const result = await this.run(sql, [
            boardRow.id, title, content, publicKey, signatureValid ? 1 : 0, timestamp / 1000, selfDestructAt
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
        
        // Get the next post number for this thread
        const maxPostResult = await this.get(`
            SELECT COALESCE(MAX(post_number), 0) as max_post_number 
            FROM posts 
            WHERE thread_id = ?
        `, [threadId]);
        
        const nextPostNumber = (maxPostResult?.max_post_number || 0) + 1;
        
        const sql = `
            INSERT INTO posts (thread_id, content, public_key, signature_valid, post_number, created_at)
            VALUES (?, ?, ?, ?, ?, datetime(?, 'unixepoch', 'subsec'))
        `;
        
        const result = await this.run(sql, [
            threadId, content, publicKey, signatureValid ? 1 : 0, nextPostNumber, timestamp / 1000
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

    /**
     * Delete expired threads (self-destruct cleanup)
     */
    async cleanupExpiredThreads() {
        try {
            const now = new Date().toISOString();
            const result = await this.run(
                'DELETE FROM threads WHERE self_destruct_at IS NOT NULL AND self_destruct_at <= ?',
                [now]
            );
            
            if (result.changes > 0) {
                console.log(`Cleaned up ${result.changes} expired threads`);
            }
            
            return result.changes;
        } catch (error) {
            console.error('Error cleaning up expired threads:', error);
            return 0;
        }
    }
}

// Create singleton instance
const database = new DatabaseService();

module.exports = database;
