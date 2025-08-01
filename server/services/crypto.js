/**
 * Server-side cryptographic functions
 * Handles signature verification and key validation
 */

const crypto = require('crypto');

const cryptoService = {
    /**
     * Verify ECDSA signature using P-256 curve
     */
    async verifySignature(message, signatureHex, publicKeyHex) {
        try {
            // Convert hex strings to buffers
            const signatureBuffer = Buffer.from(signatureHex, 'hex');
            const publicKeyBuffer = Buffer.from(publicKeyHex, 'hex');

            // Import the public key
            const publicKey = crypto.createPublicKey({
                key: publicKeyBuffer,
                format: 'der',
                type: 'spki'
                // For raw format P-256 keys, we need to construct the DER format
            });

            // For raw P-256 keys (65 bytes), we need to construct proper DER format
            if (publicKeyBuffer.length === 65) {
                // P-256 uncompressed point format: 0x04 + 32 bytes X + 32 bytes Y
                const x = publicKeyBuffer.slice(1, 33);
                const y = publicKeyBuffer.slice(33, 65);
                
                // Create DER-encoded SubjectPublicKeyInfo for P-256
                const derKey = this.createP256DER(x, y);
                
                const publicKeyObj = crypto.createPublicKey({
                    key: derKey,
                    format: 'der',
                    type: 'spki'
                });

                // Verify the signature
                const verify = crypto.createVerify('SHA256');
                verify.update(message);
                return verify.verify(publicKeyObj, signatureBuffer);
            }

            return false;
        } catch (error) {
            console.error('Signature verification error:', error);
            return false;
        }
    },

    /**
     * Create DER-encoded SubjectPublicKeyInfo for P-256 public key
     */
    createP256DER(x, y) {
        // P-256 OID: 1.2.840.10045.3.1.7
        const p256OID = Buffer.from([0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]);
        
        // Algorithm identifier for ECDSA with P-256
        const algorithmId = Buffer.concat([
            Buffer.from([0x30, 0x13]), // SEQUENCE, length 19
            Buffer.from([0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]), // ecPublicKey OID
            p256OID
        ]);

        // Public key (uncompressed point format)
        const publicKeyBytes = Buffer.concat([
            Buffer.from([0x04]), // Uncompressed point indicator
            x,
            y
        ]);

        // Bit string containing the public key
        const publicKeyBitString = Buffer.concat([
            Buffer.from([0x03, 0x42, 0x00]), // BIT STRING, length 66, no unused bits
            publicKeyBytes
        ]);

        // Complete SubjectPublicKeyInfo
        const totalLength = algorithmId.length + publicKeyBitString.length;
        return Buffer.concat([
            Buffer.from([0x30, totalLength]), // SEQUENCE
            algorithmId,
            publicKeyBitString
        ]);
    },

    /**
     * Alternative verification using Web Crypto API compatible format
     */
    async verifySignatureWebFormat(message, signatureHex, publicKeyHex) {
        try {
            // For testing with Node.js crypto.webcrypto (Node 16+)
            if (crypto.webcrypto) {
                const publicKeyBuffer = Buffer.from(publicKeyHex, 'hex');
                const signatureBuffer = Buffer.from(signatureHex, 'hex');

                const publicKey = await crypto.webcrypto.subtle.importKey(
                    'raw',
                    publicKeyBuffer,
                    {
                        name: 'ECDSA',
                        namedCurve: 'P-256'
                    },
                    false,
                    ['verify']
                );

                const encoder = new TextEncoder();
                const data = encoder.encode(message);

                const isValid = await crypto.webcrypto.subtle.verify(
                    {
                        name: 'ECDSA',
                        hash: { name: 'SHA-256' }
                    },
                    publicKey,
                    signatureBuffer,
                    data
                );

                return isValid;
            }

            // Fallback to Node.js crypto
            return this.verifySignature(message, signatureHex, publicKeyHex);
        } catch (error) {
            console.error('Web format verification error:', error);
            return false;
        }
    },

    /**
     * Validate public key format
     */
    validatePublicKey(publicKeyHex) {
        try {
            if (!publicKeyHex || typeof publicKeyHex !== 'string') {
                return { valid: false, error: 'Public key must be a string' };
            }

            // Check if it's valid hex
            if (!/^[0-9a-fA-F]+$/.test(publicKeyHex)) {
                return { valid: false, error: 'Public key must be valid hexadecimal' };
            }

            // Check length (P-256 uncompressed: 65 bytes = 130 hex chars)
            if (publicKeyHex.length !== 130) {
                return { valid: false, error: 'Invalid public key length for P-256' };
            }

            // Check that it starts with 0x04 (uncompressed point indicator)
            if (!publicKeyHex.startsWith('04')) {
                return { valid: false, error: 'Public key must be in uncompressed format' };
            }

            return { valid: true };
        } catch (error) {
            return { valid: false, error: 'Public key validation failed' };
        }
    },

    /**
     * Generate a hash from public key for anonymous identification
     */
    hashPublicKey(publicKeyHex) {
        return crypto.createHash('sha256').update(publicKeyHex).digest('hex').substring(0, 16);
    },

    /**
     * Generate secure random token
     */
    generateSecureToken(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    },

    /**
     * Hash content for duplicate detection
     */
    hashContent(content) {
        return crypto.createHash('sha256').update(content).digest('hex');
    },

    /**
     * Verify timestamp is within acceptable range
     */
    verifyTimestamp(timestamp, maxAge = 5 * 60 * 1000) {
        const now = Date.now();
        const age = now - timestamp;
        
        return {
            valid: age >= 0 && age <= maxAge,
            age: age
        };
    }
};

module.exports = cryptoService;
