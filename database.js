const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

class Database {
    constructor() {
        this.db = null;
    }

    async connect() {
        this.db = await open({
            filename: 'websites.db',
            driver: sqlite3.Database
        });

        await this.createTable();
    }

    async createTable() {
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS website (
                domain TEXT PRIMARY KEY,
                sitemap TEXT,
                sitemapUpdateTime DATETIME,
                diff TEXT
            )
        `);
    }

    async updateWebsite(domain, sitemap, diff = null) {
        const now = new Date().toISOString();
        await this.db.run(
            `INSERT OR REPLACE INTO website (domain, sitemap, sitemapUpdateTime, diff) 
             VALUES (?, ?, ?, ?)`,
            [domain, sitemap, now, diff]
        );
    }

    async getWebsite(domain) {
        return await this.db.get('SELECT * FROM website WHERE domain = ?', [domain]);
    }
}

module.exports = new Database(); 