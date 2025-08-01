/**
 * Middleware to block search engine crawlers and bots
 * Helps maintain anonymity by preventing indexing
 */

const security = require('../config/security');

const crawlerBlocker = {
    /**
     * Main middleware function to block crawlers
     */
    blockCrawlers: (req, res, next) => {
        const userAgent = req.get('User-Agent') || '';
        const ip = req.ip || req.connection.remoteAddress || '';

        // Check if request is from a known bot
        if (security.filtering.isBot(userAgent)) {
            console.log(`Blocked bot request: ${userAgent} from ${security.anonymization.hashIP(ip)}`);
            
            // Return a generic error page instead of forum content
            return res.status(403).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Access Denied</title>
                    <meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
                </head>
                <body>
                    <h1>Access Denied</h1>
                    <p>This site does not allow automated access.</p>
                </body>
                </html>
            `);
        }

        // Check for suspicious request patterns
        if (security.filtering.isSuspicious(req.url, req.body)) {
            console.log(`Blocked suspicious request from ${security.anonymization.hashIP(ip)}: ${req.url}`);
            return res.status(403).json({ error: 'Forbidden' });
        }

        // Add anti-indexing headers
        res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
        
        next();
    },

    /**
     * Generate robots.txt that blocks all crawlers
     */
    generateRobotsTxt: (req, res) => {
        const robotsTxt = `
User-agent: *
Disallow: /
Crawl-delay: 86400

# Specific bots
User-agent: Googlebot
Disallow: /

User-agent: Bingbot
Disallow: /

User-agent: Slurp
Disallow: /

User-agent: DuckDuckBot
Disallow: /

User-agent: Baiduspider
Disallow: /

User-agent: YandexBot
Disallow: /

User-agent: facebookexternalhit
Disallow: /

User-agent: Twitterbot
Disallow: /

# Archive crawlers
User-agent: ia_archiver
Disallow: /

User-agent: archive.org_bot
Disallow: /

User-agent: Wayback
Disallow: /
        `.trim();

        res.setHeader('Content-Type', 'text/plain');
        res.send(robotsTxt);
    },

    /**
     * Check for common crawler paths and block them
     */
    blockCrawlerPaths: (req, res, next) => {
        const suspiciousPaths = [
            '/sitemap.xml',
            '/sitemap.txt',
            '/.well-known/',
            '/ads.txt',
            '/security.txt',
            '/humans.txt',
            '/feed',
            '/rss',
            '/atom.xml'
        ];

        const path = req.path.toLowerCase();
        
        if (suspiciousPaths.some(suspPath => path.includes(suspPath))) {
            return res.status(404).send('Not Found');
        }

        next();
    },

    /**
     * Block requests with crawler-like characteristics
     */
    blockCrawlerBehavior: (req, res, next) => {
        // Check for missing or suspicious headers
        const userAgent = req.get('User-Agent') || '';
        const accept = req.get('Accept') || '';
        const acceptLanguage = req.get('Accept-Language') || '';

        // Red flags for bots
        const botRedFlags = [
            !userAgent, // No user agent
            userAgent.length < 10, // Very short user agent
            !accept.includes('text/html'), // Doesn't accept HTML
            !acceptLanguage, // No language preference
            req.get('Accept-Encoding') === 'gzip', // Only gzip encoding
        ];

        const redFlagCount = botRedFlags.filter(Boolean).length;

        if (redFlagCount >= 3) {
            console.log(`Blocked likely bot based on behavior from ${security.anonymization.hashIP(req.ip)}`);
            return res.status(403).json({ error: 'Forbidden' });
        }

        next();
    },

    /**
     * Add honeypot links to catch crawlers
     */
    addHoneypots: (html) => {
        const honeypots = [
            '<a href="/admin" style="display:none;">Admin</a>',
            '<a href="/wp-admin" style="display:none;">WordPress Admin</a>',
            '<a href="/login.php" style="display:none;">Login</a>',
            '<a href="/secret" style="position:absolute;left:-9999px;">Secret</a>',
        ];

        // Insert honeypots before closing body tag
        const honeypotHtml = honeypots.join('\n');
        return html.replace('</body>', `${honeypotHtml}\n</body>`);
    },

    /**
     * Handle honeypot requests (automatic bot detection)
     */
    handleHoneypot: (req, res, next) => {
        const honeypotPaths = [
            '/admin',
            '/wp-admin',
            '/login.php',
            '/secret',
            '/phpmyadmin',
            '/.env',
            '/config.php',
            '/database.sql'
        ];

        if (honeypotPaths.includes(req.path)) {
            const ip = req.ip || req.connection.remoteAddress;
            console.log(`Honeypot triggered by ${security.anonymization.hashIP(ip)}: ${req.path}`);
            
            // Add IP to temporary block list (in production, you might want persistent storage)
            req.app.locals.blockedIPs = req.app.locals.blockedIPs || new Set();
            req.app.locals.blockedIPs.add(ip);
            
            // Return fake content to waste bot's time
            return res.status(200).send(`
                <!DOCTYPE html>
                <html>
                <head><title>Loading...</title></head>
                <body>
                    <div id="content">Loading...</div>
                    <script>
                        setTimeout(() => {
                            window.location.href = '/fake-${Math.random()}';
                        }, 5000);
                    </script>
                </body>
                </html>
            `);
        }

        next();
    },

    /**
     * Check if IP is in block list
     */
    checkBlockList: (req, res, next) => {
        const ip = req.ip || req.connection.remoteAddress;
        const blockedIPs = req.app.locals.blockedIPs || new Set();

        if (blockedIPs.has(ip)) {
            return res.status(403).send('Access Denied');
        }

        next();
    }
};

module.exports = crawlerBlocker;
