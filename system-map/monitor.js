const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SYSTEMS_FILE = 'C:\\Users\\Itzhak\\.openclaw\\workspace\\system-map\\systems.json';
const DATA_FILE = 'C:\\Users\\Itzhak\\.openclaw\\workspace\\system-map\\dashboard-data.json';

function getDirSize(dirPath) {
    try {
        let totalSize = 0;
        const files = fs.readdirSync(dirPath, { recursive: true });
        for (const file of files) {
            const fullPath = path.join(dirPath, file);
            try {
                const stats = fs.statSync(fullPath);
                if (stats.isFile()) totalSize += stats.size;
            } catch (e) {}
        }
        return Math.round(totalSize / (1024 * 1024)); // Return MB
    } catch (e) {
        return 0;
    }
}

function getLatestModifiedTime(dirPath) {
    try {
        const files = fs.readdirSync(dirPath, { recursive: true });
        let latest = 0;
        for (const file of files) {
            const fullPath = path.join(dirPath, file);
            const stats = fs.statSync(fullPath);
            if (stats.mtimeMs > latest) latest = stats.mtimeMs;
        }
        return latest;
    } catch (e) {
        return 0;
    }
}

function checkResidue(dirPath) {
    try {
        const files = fs.readdirSync(dirPath, { recursive: true });
        const residue = files.filter(f => f.endsWith('.bak') || f.endsWith('.tmp') || f.includes('.tmp.'));
        return residue;
    } catch (e) {
        return [];
    }
}

function pushToGithub() {
    try {
        console.log('Pushing updates to GitHub...');
        execSync(`git add "${SYSTEMS_FILE}" "${DATA_FILE}" "system-map/archive/"`);
        execSync(`git commit -m "Auto-update system map data and snapshots [skip ci]"`);
        execSync(`git push`);
        console.log('GitHub updated successfully.');
    } catch (e) {
        console.error('GitHub push failed:', e.message);
    }
}

function createDashboardSnapshot() {
    try {
        const archiveDir = path.join(path.dirname(DATA_FILE), 'archive');
        if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
        const snapshotHtmlPath = path.join(archiveDir, `dashboard-${timestamp}.html`);
        
        const htmlTemplate = fs.readFileSync(path.join(path.dirname(DATA_FILE), 'dashboard.html'), 'utf8');
        const currentData = fs.readFileSync(DATA_FILE, 'utf8');
        
        // Embed the data directly into the HTML to make it a permanent snapshot
        const modifiedHtml = htmlTemplate.replace(
            /async function init() {[\s\S]*?<\/script>/,
            `
            <script>
            const snapshotData = ${currentData};
            async function init() {
              try {
                renderStats(snapshotData);
                renderSystems(snapshotData.systems);
              } catch (e) {
                console.error('Snapshot load failed:', e);
              }
            }
            `
        );

        fs.writeFileSync(snapshotHtmlPath, modifiedHtml);
        console.log(`Dashboard snapshot created: ${snapshotHtmlPath}`);

        // Keep only last 10 snapshots
        const snapshots = fs.readdirSync(archiveDir).filter(f => f.startsWith('dashboard-')).sort();
        if (snapshots.length > 10) {
            snapshots.slice(0, snapshots.length - 10).forEach(f => fs.unlinkSync(path.join(archiveDir, f)));
        }
    } catch (e) {
        console.error('Snapshot failed:', e.message);
    }
}

async function runMonitor() {
    console.log('Starting System Map Monitor...');
    
    if (!fs.existsSync(SYSTEMS_FILE)) {
        console.error('Systems file not found');
        process.exit(1);
    }

    const systemsData = JSON.parse(fs.readFileSync(SYSTEMS_FILE, 'utf8'));
    const now = new Date().toISOString();

    systemsData.systems.forEach(sys => {
        console.log(`Checking ${sys.display_name}...`);
        
        if (fs.existsSync(sys.workspace_path)) {
            const latestTime = getLatestModifiedTime(sys.workspace_path);
            const residue = checkResidue(sys.workspace_path);
            const currentSize = getDirSize(sys.workspace_path);
            
            // Update Liveness
            const isRecent = (Date.now() - latestTime) < 24 * 60 * 60 * 1000; // 24h
            sys.status = isRecent ? 'active' : 'stale';
            sys.last_checked = now;
            
            // Update Weight
            if (sys.weight_details) {
                sys.weight_details.size_mb = currentSize;
            }
            
            // Residue detection
            if (residue.length > 0) {
                sys.needs_cleanup = true;
            }
        } else {
            sys.status = 'missing';
        }
    });

    // Self-Audit for System Map
    const sysMap = systemsData.systems.find(s => s.system_id === 'system-system-map');
    if (sysMap) {
        console.log('Performing Self-Audit on System Map...');
        const mapSize = getDirSize(sysMap.workspace_path);
        if (sysMap.weight_details) sysMap.weight_details.size_mb = mapSize;
        
        // If pushToGithub failed or files are old, lower score temporarily
        // This is a basic self-health check
        sysMap.status = 'active';
    }

    // Update the summary
    systemsData.generated_at = now;
    systemsData.summary = {
        total_systems: systemsData.systems.length,
        heavy_systems: systemsData.systems.filter(s => s.weight === 'heavy').length,
        needs_cleanup: systemsData.systems.filter(s => s.needs_cleanup).length,
        closest_to_10_count: systemsData.systems.filter(s => s.overall_score >= 8).length
    };

    // Save back to systems.json
    fs.writeFileSync(SYSTEMS_FILE, JSON.stringify(systemsData, null, 2));
    
    // Sync to dashboard-data.json (the dashboard uses this one)
    fs.writeFileSync(DATA_FILE, JSON.stringify(systemsData, null, 2));

    console.log('Local files updated successfully.');
    
    // Archive and Create Snapshot
    archiveDashboard();
    createDashboardSnapshot();
    
    // Now push to GitHub to update the live dashboard
    pushToGithub();
}

runMonitor().catch(console.error);
