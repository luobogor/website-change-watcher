const fs = require('fs').promises;
const axios = require('axios');
const xml2js = require('xml2js');
const database = require('./database');
const diff = require('diff');

async function readDomains() {
    try {
        const data = await fs.readFile('domains.txt', 'utf8');
        return data.split('\n').filter(domain => domain.trim());
    } catch (error) {
        console.error('Failed to read domains file:', error);
        return [];
    }
}

async function fetchSitemapFromRobots(domain) {
    try {
        const response = await axios.get(`${domain}/robots.txt`);
        const robotsTxt = response.data;
        const sitemapMatch = robotsTxt.match(/Sitemap:\s*(.+)/i);
        if (sitemapMatch) {
            return sitemapMatch[1].trim();
        }
    } catch (error) {
        console.error(`Failed to get robots.txt from ${domain}:`, error.message);
    }
    return null;
}

async function fetchAndParseSitemap(url) {
    try {
        const response = await axios.get(url);
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(response.data);
        return response.data;
    } catch (error) {
        console.error(`Failed to fetch sitemap ${url}:`, error.message);
        return null;
    }
}

function compareSitemaps(oldSitemap, newSitemap) {
    if (!oldSitemap) return {
        status: 'New sitemap',
        changes: 'Initial sitemap version'
    };

    if (oldSitemap === newSitemap) {
        return null;
    }

    const extractUrls = (sitemap) => {
        const urlRegex = /<loc>(.*?)<\/loc>/g;
        const urls = [];
        let match;
        while ((match = urlRegex.exec(sitemap)) !== null) {
            urls.push(match[1]);
        }
        return urls;
    };

    const oldUrls = extractUrls(oldSitemap);
    const newUrls = extractUrls(newSitemap);

    const addedUrls = newUrls.filter(url => !oldUrls.includes(url));
    const removedUrls = oldUrls.filter(url => !newUrls.includes(url));

    const changes = {
        added: addedUrls,
        removed: removedUrls
    };

    const summary = [];
    if (addedUrls.length > 0) {
        summary.push(`Added ${addedUrls.length} URLs`);
    }
    if (removedUrls.length > 0) {
        summary.push(`Removed ${removedUrls.length} URLs`);
    }

    return {
        status: 'Sitemap updated',
        summary: summary.join(', '),
        changes: JSON.stringify(changes, null, 2)
    };
}

async function checkDomain(domain) {
    if (!domain.startsWith('http')) {
        domain = 'https://' + domain;
    }

    let sitemapUrl = `${domain}/sitemap.xml`;
    let sitemap = await fetchAndParseSitemap(sitemapUrl);

    if (!sitemap) {
        const robotsSitemap = await fetchSitemapFromRobots(domain);
        if (robotsSitemap) {
            sitemap = await fetchAndParseSitemap(robotsSitemap);
            sitemapUrl = robotsSitemap;
        }
    }

    if (!sitemap) {
        console.log(`${domain}: Sitemap not found`);
        return;
    }

    const oldData = await database.getWebsite(domain);
    const diffResult = compareSitemaps(oldData?.sitemap, sitemap);
    
    if (diffResult) {
        await database.updateWebsite(domain, sitemap, diffResult.changes);
        console.log(`${domain}: ${diffResult.status}`);
        if (diffResult.summary) {
            console.log(`Changes: ${diffResult.summary}`);
        }
    } else {
        console.log(`${domain}: No changes`);
    }
}

async function main() {
    await database.connect();
    const domains = await readDomains();
    
    for (const domain of domains) {
        await checkDomain(domain.trim());
    }
}

main().catch(console.error);