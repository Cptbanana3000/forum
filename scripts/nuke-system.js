/**
 * Emergency destruction script for the anonymous forum
 * This script will completely destroy all data and evidence of the forum
 * Use with extreme caution - this action is irreversible
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class NukeSystem {
    constructor() {
        this.projectRoot = path.join(__dirname, '..');
        this.dataFiles = [
            'data/forum.db',
            'data/forum.db-journal',
            'data/forum.db-wal',
            'data/forum.db-shm'
        ];
        this.logFiles = [
            'logs/access.log',
            'logs/error.log',
            'logs/app.log'
        ];
    }

    /**
     * Execute complete system destruction
     */
    async nuke() {
        console.log('🚨 NUCLEAR OPTION ACTIVATED 🚨');
        console.log('Starting complete system destruction...\n');

        try {
            // Step 1: Overwrite database files
            await this.destroyDatabaseFiles();

            // Step 2: Destroy log files
            await this.destroyLogFiles();

            // Step 3: Clear temporary files
            await this.clearTempFiles();

            // Step 4: Overwrite memory (attempt)
            await this.scrubMemory();

            // Step 5: Final verification
            await this.verifyDestruction();

            console.log('\n✅ DESTRUCTION COMPLETE');
            console.log('All traces of the forum have been eliminated.');
            console.log('The system is now clean.');

        } catch (error) {
            console.error('❌ DESTRUCTION FAILED:', error.message);
            console.error('Manual cleanup may be required.');
            process.exit(1);
        }
    }

    /**
     * Securely overwrite database files
     */
    async destroyDatabaseFiles() {
        console.log('💥 Destroying database files...');

        for (const file of this.dataFiles) {
            const filePath = path.join(this.projectRoot, file);
            
            if (fs.existsSync(filePath)) {
                console.log(`  Nuking: ${file}`);
                
                // Get file size
                const stats = fs.statSync(filePath);
                const fileSize = stats.size;

                // Overwrite with random data multiple times
                for (let pass = 0; pass < 7; pass++) {
                    const randomData = crypto.randomBytes(fileSize);
                    fs.writeFileSync(filePath, randomData);
                }

                // Final overwrite with zeros
                const zeroData = Buffer.alloc(fileSize, 0);
                fs.writeFileSync(filePath, zeroData);

                // Delete the file
                fs.unlinkSync(filePath);
                console.log(`  ✓ ${file} obliterated`);
            }
        }
    }

    /**
     * Destroy log files
     */
    async destroyLogFiles() {
        console.log('📝 Destroying log files...');

        for (const file of this.logFiles) {
            const filePath = path.join(this.projectRoot, file);
            
            if (fs.existsSync(filePath)) {
                console.log(`  Nuking: ${file}`);
                
                const stats = fs.statSync(filePath);
                const fileSize = stats.size;

                // Overwrite with random data
                const randomData = crypto.randomBytes(fileSize);
                fs.writeFileSync(filePath, randomData);

                // Delete the file
                fs.unlinkSync(filePath);
                console.log(`  ✓ ${file} obliterated`);
            }
        }
    }

    /**
     * Clear temporary files and caches
     */
    async clearTempFiles() {
        console.log('🗑️  Clearing temporary files...');

        const tempDirs = [
            'node_modules/.cache',
            '.npm',
            'tmp',
            'temp'
        ];

        for (const dir of tempDirs) {
            const dirPath = path.join(this.projectRoot, dir);
            if (fs.existsSync(dirPath)) {
                this.removeDirectory(dirPath);
                console.log(`  ✓ ${dir} cleared`);
            }
        }
    }

    /**
     * Attempt to scrub sensitive data from memory
     */
    async scrubMemory() {
        console.log('🧠 Attempting memory scrub...');

        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }

        // Allocate and release memory to overwrite previous data
        const memoryBomb = [];
        try {
            for (let i = 0; i < 10; i++) {
                memoryBomb.push(crypto.randomBytes(10 * 1024 * 1024)); // 10MB chunks
            }
        } catch (e) {
            // Ignore memory allocation failures
        }

        // Clear the bomb
        memoryBomb.length = 0;

        if (global.gc) {
            global.gc();
        }

        console.log('  ✓ Memory scrub attempted');
    }

    /**
     * Verify that destruction was successful
     */
    async verifyDestruction() {
        console.log('🔍 Verifying destruction...');

        let foundFiles = false;

        // Check database files
        for (const file of this.dataFiles) {
            const filePath = path.join(this.projectRoot, file);
            if (fs.existsSync(filePath)) {
                console.log(`  ❌ WARNING: ${file} still exists`);
                foundFiles = true;
            }
        }

        // Check log files
        for (const file of this.logFiles) {
            const filePath = path.join(this.projectRoot, file);
            if (fs.existsSync(filePath)) {
                console.log(`  ❌ WARNING: ${file} still exists`);
                foundFiles = true;
            }
        }

        if (!foundFiles) {
            console.log('  ✓ All targeted files successfully destroyed');
        }
    }

    /**
     * Recursively remove directory
     */
    removeDirectory(dirPath) {
        if (fs.existsSync(dirPath)) {
            fs.readdirSync(dirPath).forEach((file) => {
                const currentPath = path.join(dirPath, file);
                if (fs.lstatSync(currentPath).isDirectory()) {
                    this.removeDirectory(currentPath);
                } else {
                    // Overwrite file before deletion
                    try {
                        const stats = fs.statSync(currentPath);
                        const randomData = crypto.randomBytes(stats.size);
                        fs.writeFileSync(currentPath, randomData);
                    } catch (e) {
                        // Ignore errors, just delete
                    }
                    fs.unlinkSync(currentPath);
                }
            });
            fs.rmdirSync(dirPath);
        }
    }
}

// Check if script is run directly
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.includes('--confirm-destruction')) {
        const nukeSystem = new NukeSystem();
        nukeSystem.nuke().then(() => {
            process.exit(0);
        }).catch((error) => {
            console.error('Nuke failed:', error);
            process.exit(1);
        });
    } else {
        console.log('🚨 DANGER: NUCLEAR OPTION 🚨');
        console.log('This script will PERMANENTLY DESTROY all forum data.');
        console.log('This action is IRREVERSIBLE.');
        console.log('');
        console.log('To proceed, run:');
        console.log('node scripts/nuke-system.js --confirm-destruction');
        console.log('');
        console.log('⚠️  USE ONLY IN EMERGENCY SITUATIONS ⚠️');
    }
}

module.exports = NukeSystem;
