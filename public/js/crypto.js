/**
 * Client-side cryptographic functions for the anonymous forum
 * Handles key generation, signing, and verification
 */

class CryptoManager {
    constructor() {
        this.keyPair = null;
        this.publicKeyHex = null;
    }

    /**
     * Generate a new cryptographic key pair
     */
    async generateKeyPair() {
        try {
            this.keyPair = await window.crypto.subtle.generateKey(
                {
                    name: "ECDSA",
                    namedCurve: "P-256"
                },
                true,
                ["sign", "verify"]
            );

            // Export public key to hex format
            const publicKeyBuffer = await window.crypto.subtle.exportKey("raw", this.keyPair.publicKey);
            this.publicKeyHex = this.bufferToHex(publicKeyBuffer);

            return this.publicKeyHex;
        } catch (error) {
            console.error('Error generating key pair:', error);
            throw new Error('Failed to generate cryptographic keys');
        }
    }

    /**
     * Sign a message with the private key
     */
    async signMessage(message) {
        if (!this.keyPair) {
            throw new Error('No key pair available. Generate keys first.');
        }

        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(message);
            
            const signature = await window.crypto.subtle.sign(
                {
                    name: "ECDSA",
                    hash: { name: "SHA-256" }
                },
                this.keyPair.privateKey,
                data
            );

            return this.bufferToHex(signature);
        } catch (error) {
            console.error('Error signing message:', error);
            throw new Error('Failed to sign message');
        }
    }

    /**
     * Verify a signature (for client-side validation)
     */
    async verifySignature(message, signatureHex, publicKeyHex) {
        try {
            const publicKeyBuffer = this.hexToBuffer(publicKeyHex);
            const signatureBuffer = this.hexToBuffer(signatureHex);
            
            const publicKey = await window.crypto.subtle.importKey(
                "raw",
                publicKeyBuffer,
                {
                    name: "ECDSA",
                    namedCurve: "P-256"
                },
                false,
                ["verify"]
            );

            const encoder = new TextEncoder();
            const data = encoder.encode(message);

            const isValid = await window.crypto.subtle.verify(
                {
                    name: "ECDSA",
                    hash: { name: "SHA-256" }
                },
                publicKey,
                signatureBuffer,
                data
            );

            return isValid;
        } catch (error) {
            console.error('Error verifying signature:', error);
            return false;
        }
    }

    /**
     * Convert ArrayBuffer to hex string
     */
    bufferToHex(buffer) {
        const byteArray = new Uint8Array(buffer);
        const hexCodes = [...byteArray].map(value => {
            const hexCode = value.toString(16);
            const paddedHexCode = hexCode.padStart(2, '0');
            return paddedHexCode;
        });
        return hexCodes.join('');
    }

    /**
     * Convert hex string to ArrayBuffer
     */
    hexToBuffer(hex) {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
        }
        return bytes.buffer;
    }

    /**
     * Generate a short identifier from public key (first 8 characters)
     */
    getShortId() {
        if (!this.publicKeyHex) {
            return null;
        }
        return this.publicKeyHex.substring(0, 8);
    }

    /**
     * Store key pair in session storage (temporary)
     */
    async storeKeys() {
        if (!this.keyPair) {
            throw new Error('No key pair to store');
        }

        try {
            const privateKey = await window.crypto.subtle.exportKey("pkcs8", this.keyPair.privateKey);
            const publicKey = await window.crypto.subtle.exportKey("raw", this.keyPair.publicKey);

            sessionStorage.setItem('forum_private_key', this.bufferToHex(privateKey));
            sessionStorage.setItem('forum_public_key', this.bufferToHex(publicKey));
        } catch (error) {
            console.error('Error storing keys:', error);
            throw new Error('Failed to store keys');
        }
    }

    /**
     * Load key pair from session storage
     */
    async loadKeys() {
        try {
            const privateKeyHex = sessionStorage.getItem('forum_private_key');
            const publicKeyHex = sessionStorage.getItem('forum_public_key');

            if (!privateKeyHex || !publicKeyHex) {
                return false;
            }

            const privateKeyBuffer = this.hexToBuffer(privateKeyHex);
            const publicKeyBuffer = this.hexToBuffer(publicKeyHex);

            const privateKey = await window.crypto.subtle.importKey(
                "pkcs8",
                privateKeyBuffer,
                {
                    name: "ECDSA",
                    namedCurve: "P-256"
                },
                true,
                ["sign"]
            );

            const publicKey = await window.crypto.subtle.importKey(
                "raw",
                publicKeyBuffer,
                {
                    name: "ECDSA",
                    namedCurve: "P-256"
                },
                true,
                ["verify"]
            );

            this.keyPair = { privateKey, publicKey };
            this.publicKeyHex = this.bufferToHex(publicKeyBuffer);

            return true;
        } catch (error) {
            console.error('Error loading keys:', error);
            return false;
        }
    }

    /**
     * Clear stored keys
     */
    clearKeys() {
        sessionStorage.removeItem('forum_private_key');
        sessionStorage.removeItem('forum_public_key');
        this.keyPair = null;
        this.publicKeyHex = null;
    }
}

// Global crypto manager instance
window.cryptoManager = new CryptoManager();
