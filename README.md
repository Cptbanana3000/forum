# Anonymous Forum

A cryptographically-secured anonymous forum that prioritizes privacy, security, and user anonymity. Built with Node.js, Express, and SQLite, featuring client-side cryptographic signatures and comprehensive anti-tracking measures.

## 🔐 Features

### Core Functionality
- **Anonymous Posting**: No registration required, users identified only by cryptographic signatures
- **Cryptographic Authentication**: ECDSA P-256 signatures verify post authenticity
- **Self-Contained**: SQLite database, no external dependencies
- **Real-time Updates**: Auto-refreshing posts and threads

### Privacy & Security
- **Anti-Crawler Protection**: Blocks search engines and bots
- **Rate Limiting**: Prevents spam and abuse
- **Content Validation**: XSS protection and content filtering  
- **No Logging**: IP addresses are hashed for privacy
- **Security Headers**: Comprehensive protection against common attacks

### Emergency Features
- **Nuclear Option**: Complete data destruction script (`nuke-system.js`)
- **Self-Destruct**: Secure overwriting of all forum data
- **Memory Scrubbing**: Attempts to clear sensitive data from memory

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ 
- npm 8+

### Installation

1. **Clone and setup**:
   ```bash
   git clone <repository-url>
   cd forum
   npm install
   ```

2. **Start the forum**:
   ```bash
   npm start
   ```

3. **Visit**: `http://localhost:3000`

### Development Mode
```bash
npm run dev  # Uses nodemon for auto-restart
```

## 🏗️ Architecture

### Directory Structure
```
├── data/                   # SQLite database (auto-created)
├── docker/                 # Container configurations
├── public/                 # Static assets (CSS, JS)
│   ├── css/style.css      # Forum styling
│   └── js/
│       ├── crypto.js      # Client-side cryptography
│       └── posting.js     # Post submission & rendering
├── scripts/
│   └── nuke-system.js     # Emergency destruction
├── server/
│   ├── config/security.js # Security configurations
│   ├── middleware/        # Authentication & bot blocking
│   ├── routes/api.js      # REST API endpoints
│   ├── services/          # Database & crypto services
│   └── app.js            # Main Express server
├── views/                 # HTML templates
└── package.json
```

### Technology Stack
- **Backend**: Node.js, Express, SQLite
- **Frontend**: Vanilla JavaScript, CSS
- **Security**: Helmet, Rate limiting, CSRF protection
- **Crypto**: Web Crypto API (ECDSA P-256)

## 🔑 Cryptographic System

### Key Generation
- **Algorithm**: ECDSA with P-256 curve
- **Storage**: Browser sessionStorage (temporary)
- **Format**: Uncompressed public keys (130 hex chars)

### Message Signing
Messages are signed with the format:
- **Threads**: `${title}|${content}|${timestamp}`
- **Posts**: `${content}|${threadId}|${timestamp}`

### Verification
- Server verifies all signatures before accepting posts
- Invalid signatures are rejected
- Public keys create consistent anonymous IDs

## 📡 API Endpoints

### Boards
- `GET /api/boards` - List all boards
- `GET /api/boards/:board/threads` - Get threads for board

### Threads  
- `POST /api/threads` - Create new thread (requires signature)
- `GET /api/threads/:id` - Get thread details
- `GET /api/threads/:id/posts` - Get thread posts

### Posts
- `POST /api/posts` - Create new post (requires signature)

### Utility
- `GET /api/stats` - Forum statistics
- `GET /api/recent` - Recent activity
- `POST /api/verify` - Verify signature (testing)

## 🛡️ Security Features

### Anti-Tracking
- Blocks search engine crawlers
- No referrer headers
- Honeypot links catch bots
- Content Security Policy

### Rate Limiting
- **API**: 100 requests/15min per IP
- **Posts**: 5 posts/minute per IP  
- **Threads**: 2 threads/5min per IP
- **Per-Key**: Additional limits per cryptographic identity

### Content Protection
- XSS filtering
- Content length limits
- Forbidden pattern detection
- Duplicate content prevention

## 🐳 Docker Deployment

### Build and Run
```bash
npm run docker:build
npm run docker:run
```

### Production Deployment
```bash
docker-compose -f docker/docker-compose.yml up -d
```

Optional IPFS integration available in docker-compose.yml.

## ⚠️ Emergency Procedures

### Nuclear Option
**⚠️ IRREVERSIBLE ACTION ⚠️**

Complete forum destruction:
```bash
npm run nuke-confirm
```

This will:
- Securely overwrite database files (7-pass)
- Destroy all logs and temporary files  
- Attempt memory scrubbing
- Verify complete data destruction

Use only in absolute emergency situations.

## 🔧 Configuration

### Environment Variables
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment mode

### Security Settings
Edit `server/config/security.js` to modify:
- Rate limiting parameters
- Content validation rules
- Security headers
- Forbidden patterns

### Database
SQLite database auto-created at `data/forum.db`. No manual setup required.

## 🤝 Contributing

This is a privacy-focused project. Consider:
- Security implications of changes
- User anonymity preservation  
- Anti-tracking measures
- No telemetry or analytics

## 📜 License

MIT License - Use responsibly and respect user privacy.

## ⚡ Performance Notes

- SQLite performs well for small-medium forums
- Client-side crypto adds ~100ms per post
- Memory usage ~50MB base + ~1MB per 1000 posts
- Consider cleanup of old posts for long-term operation

## 🚨 Legal Notice

This software is provided for educational and legitimate use only. Users are responsible for compliance with local laws and regulations. The authors assume no responsibility for misuse or illegal activities.

---

**Remember**: True anonymity requires proper OpSec. This forum provides technical anonymity but cannot protect against behavioral analysis or metadata correlation.
