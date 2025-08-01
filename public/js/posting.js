/**
 * Handles post submission and rendering for the anonymous forum
 */

class ForumManager {
    constructor() {
        this.currentBoard = null;
        this.currentThread = null;
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized) return;
        try {
            const hasKeys = await window.cryptoManager.loadKeys();
            if (!hasKeys) {
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

    async generateNewIdentity() {
        try {
            this.showAlert('Generating new cryptographic identity...', 'info');
            await window.cryptoManager.generateKeyPair();
            await window.cryptoManager.storeKeys();
            this.updateIdentityDisplay();
            this.showAlert('New identity generated successfully', 'success');
        } catch (error) {
            console.error('Failed to generate identity:', error);
            this.showAlert('Failed to generate identity', 'error');
        }
    }

    setupEventListeners() {
        const newIdentityBtn = document.getElementById('newIdentityBtn');
        if (newIdentityBtn) newIdentityBtn.addEventListener('click', () => this.generateNewIdentity());

        const postForm = document.getElementById('postForm');
        if (postForm) postForm.addEventListener('submit', (e) => this.handlePostSubmission(e));

        const threadForm = document.getElementById('threadForm');
        if (threadForm) threadForm.addEventListener('submit', (e) => this.handleThreadSubmission(e));
    }

    updateIdentityDisplay() {
        const identityElement = document.getElementById('currentIdentity');
        if (identityElement && window.cryptoManager.publicKeyHex) {
            const shortId = window.cryptoManager.getShortId();
            identityElement.textContent = `ID: ${shortId}`;
        }
    }

    async handleThreadSubmission(event) {
        event.preventDefault();
        const form = event.target;
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        try {
            const formData = new FormData(form);
            const title = formData.get('title');
            const content = formData.get('content');
            const board = formData.get('board');
            const selfDestruct = formData.get('selfDestruct'); // Get the new timer value

            if (!title || !content) throw new Error('Title and content are required');

            const timestamp = Date.now();
            const message = `${title}|${content}|${timestamp}`;
            const signature = await window.cryptoManager.signMessage(message);
            const publicKey = window.cryptoManager.publicKeyHex;

            const response = await fetch('/api/threads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ board, title, content, timestamp, signature, publicKey, selfDestruct }) // Send it to the API
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to create thread');
            }

            const result = await response.json();
            this.showAlert('Thread created successfully', 'success');
            setTimeout(() => { window.location.href = `/thread/${result.threadId}`; }, 1000);
        } catch (error) {
            this.showAlert(error.message, 'error');
        } finally {
            submitBtn.disabled = false;
        }
    }

    async handlePostSubmission(event) {
        event.preventDefault();
        const form = event.target;
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        try {
            const formData = new FormData(form);
            const content = formData.get('content');
            const threadId = this.currentThread || formData.get('threadId');

            if (!content) throw new Error('Content is required');

            const timestamp = Date.now();
            const message = `${content}|${threadId}|${timestamp}`;
            const signature = await window.cryptoManager.signMessage(message);
            const publicKey = window.cryptoManager.publicKeyHex;

            const response = await fetch('/api/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ threadId, content, timestamp, signature, publicKey })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to create post');
            }

            form.reset();
            this.showAlert('Post created successfully', 'success');
            await this.refreshPosts();
        } catch (error) {
            this.showAlert(error.message, 'error');
        } finally {
            submitBtn.disabled = false;
        }
    }

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

    renderPosts(posts) {
        const postsContainer = document.getElementById('postsContainer');
        if (!postsContainer) return;
        postsContainer.innerHTML = posts.map(post => this.renderPost(post)).join('');
    }

    renderPost(post) {
        const shortId = post.author_id || post.public_key.substring(0, 8);
        const content = this.escapeHtml(post.content);
        return `<div class="post"><div class="post-header"><span class="post-id">Anonymous (${shortId})</span> <span class="post-number">No.${post.id}</span></div><div class="post-content">${content}</div></div>`;
    }

    showAlert(message, type = 'info') {
        const alertContainer = document.getElementById('alertContainer');
        if (!alertContainer) return;
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type}`;
        alertDiv.textContent = message;
        alertContainer.prepend(alertDiv);
        setTimeout(() => alertDiv.remove(), 5000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    setCurrentBoard(board) { this.currentBoard = board; }
    setCurrentThread(threadId) { this.currentThread = threadId; }
}

window.forumManager = new ForumManager();
document.addEventListener('DOMContentLoaded', () => window.forumManager.init());
