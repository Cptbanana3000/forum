/**
 * Handles post submission and rendering for the anonymous forum
 */

class ForumManager {
    constructor() {
        this.currentBoard = null;
        this.currentThread = null;
        this.isInitialized = false;
    }

    /**
     * Initialize the forum manager
     */
    async init() {
        if (this.isInitialized) return;

        try {
            // Try to load existing keys
            const hasKeys = await window.cryptoManager.loadKeys();
            
            if (!hasKeys) {
                // Generate new keys if none exist
                await this.generateNewIdentity();
            }

            this.setupEventListeners();
            this.updateIdentityDisplay();
            this.isInitialized = true;

            console.log('Forum manager initialized');
        } catch (error) {
            console.error('Failed to initialize forum manager:', error);
            this.showAlert('Failed to initialize cryptographic system', 'error');
        }
    }

    /**
     * Generate a new cryptographic identity
     */
    async generateNewIdentity() {
        try {
            this.showAlert('Generating new cryptographic identity...', 'info');
            
            const publicKey = await window.cryptoManager.generateKeyPair();
            await window.cryptoManager.storeKeys();
            
            this.updateIdentityDisplay();
            this.showAlert('New identity generated successfully', 'success');
            
            return publicKey;
        } catch (error) {
            console.error('Failed to generate identity:', error);
            this.showAlert('Failed to generate identity', 'error');
            throw error;
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // New identity button
        const newIdentityBtn = document.getElementById('newIdentityBtn');
        if (newIdentityBtn) {
            newIdentityBtn.addEventListener('click', () => this.generateNewIdentity());
        }

        // Post form submission
        const postForm = document.getElementById('postForm');
        if (postForm) {
            postForm.addEventListener('submit', (e) => this.handlePostSubmission(e));
        }

        // Thread form submission
        const threadForm = document.getElementById('threadForm');
        if (threadForm) {
            threadForm.addEventListener('submit', (e) => this.handleThreadSubmission(e));
        }

        // Auto-refresh posts
        setInterval(() => this.refreshPosts(), 30000); // Every 30 seconds
    }

    /**
     * Update the identity display
     */
    updateIdentityDisplay() {
        const identityElement = document.getElementById('currentIdentity');
        if (identityElement && window.cryptoManager.publicKeyHex) {
            const shortId = window.cryptoManager.getShortId();
            identityElement.textContent = `Current ID: ${shortId}`;
        }
    }

    /**
     * Handle thread submission
     */
    async handleThreadSubmission(event) {
        event.preventDefault();

        const form = event.target;
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.textContent;

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="loading"></span> Creating thread...';

            const formData = new FormData(form);
            const title = formData.get('title');
            const content = formData.get('content');
            const board = formData.get('board') || this.currentBoard;

            if (!title || !content) {
                throw new Error('Title and content are required');
            }

            // Create message to sign
            const timestamp = Date.now();
            const message = `${title}|${content}|${timestamp}`;
            
            // Sign the message
            const signature = await window.cryptoManager.signMessage(message);
            const publicKey = window.cryptoManager.publicKeyHex;

            // Submit to server
            const response = await fetch('/api/threads', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    board,
                    title,
                    content,
                    timestamp,
                    signature,
                    publicKey
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to create thread');
            }

            const result = await response.json();
            
            // Clear form and redirect
            form.reset();
            this.showAlert('Thread created successfully', 'success');
            
            // Redirect to the new thread
            setTimeout(() => {
                window.location.href = `/thread/${result.threadId}`;
            }, 1000);

        } catch (error) {
            console.error('Thread submission error:', error);
            this.showAlert(error.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
        }
    }

    /**
     * Handle post submission
     */
    async handlePostSubmission(event) {
        event.preventDefault();

        const form = event.target;
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn.textContent;

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="loading"></span> Posting...';

            const formData = new FormData(form);
            const content = formData.get('content');

            if (!content) {
                throw new Error('Content is required');
            }

            // Create message to sign
            const timestamp = Date.now();
            const threadId = this.currentThread || formData.get('threadId');
            const message = `${content}|${threadId}|${timestamp}`;
            
            // Sign the message
            const signature = await window.cryptoManager.signMessage(message);
            const publicKey = window.cryptoManager.publicKeyHex;

            // Submit to server
            const response = await fetch('/api/posts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    threadId,
                    content,
                    timestamp,
                    signature,
                    publicKey
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to create post');
            }

            // Clear form and refresh posts
            form.reset();
            this.showAlert('Post created successfully', 'success');
            await this.refreshPosts();

        } catch (error) {
            console.error('Post submission error:', error);
            this.showAlert(error.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
        }
    }

    /**
     * Refresh posts in current thread
     */
    async refreshPosts() {
        if (!this.currentThread) return;

        try {
            const response = await fetch(`/api/threads/${this.currentThread}/posts`);
            if (response.ok) {
                const posts = await response.json();
                this.renderPosts(posts);
            }
        } catch (error) {
            console.error('Failed to refresh posts:', error);
        }
    }

    /**
     * Render posts in the thread view
     */
    renderPosts(posts) {
        const postsContainer = document.getElementById('postsContainer');
        if (!postsContainer) return;

        postsContainer.innerHTML = posts.map(post => this.renderPost(post)).join('');
    }

    /**
     * Render a single post
     */
    renderPost(post) {
        const shortId = post.public_key.substring(0, 8);
        const timestamp = new Date(post.created_at).toLocaleString();
        const content = this.escapeHtml(post.content);
        const postNumber = post.post_number || post.id;
        
        const signatureStatus = post.signature_valid ? 
            '<span class="signature-verified">✓ Verified</span>' :
            '<span class="signature-failed">✗ Invalid</span>';

        return `
            <div class="post">
                <div class="post-header">
                    <span class="post-id">Anonymous (${shortId})</span>
                    <span class="post-number">No.${postNumber}</span>
                    <span class="post-time">${timestamp}</span>
                </div>
                <div class="post-content">${content}</div>
                <div class="signature-info">
                    ${signatureStatus} | Key: ${post.public_key.substring(0, 16)}...
                </div>
            </div>
        `;
    }

    /**
     * Show alert message
     */
    showAlert(message, type = 'info') {
        const alertContainer = document.getElementById('alertContainer') || document.body;
        
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type}`;
        alertDiv.textContent = message;
        
        alertContainer.insertBefore(alertDiv, alertContainer.firstChild);
        
        // Remove alert after 5 seconds
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.parentNode.removeChild(alertDiv);
            }
        }, 5000);
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Set current board
     */
    setCurrentBoard(board) {
        this.currentBoard = board;
    }

    /**
     * Set current thread
     */
    setCurrentThread(threadId) {
        this.currentThread = threadId;
    }
}

// Global forum manager instance
window.forumManager = new ForumManager();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.forumManager.init();
});
