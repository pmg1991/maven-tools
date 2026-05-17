let visited;
let zip;
let downloaded;
let skipped;
let failed;
let resolved;
let treeRoot = null;
let treeStack = [];
let artifactDepths = new Map();
let artifactVersions = new Map();
let resolvedDeps = [];

function addTreeNode(key, depth, status, reason, scope, parentKey) {
    const node = { key: key, status: status, reason: reason, scope: scope, children: [], depth: depth, dom: null, parentKey: parentKey };
    
    // Find parent node
    let parentNode = null;
    if (parentKey) {
        for (const root of treeRoot || []) {
            parentNode = findNode(root, parentKey);
            if (parentNode) break;
        }
    }
    
    if (depth === 0 || !parentNode) {
        treeRoot = treeRoot || [];
        treeRoot.push(node);
    } else {
        parentNode.children.push(node);
    }
    
    renderTree();
    return node;
}

function findNode(node, key) {
    if (node.key === key) return node;
    for (const child of node.children) {
        const found = findNode(child, key);
        if (found) return found;
    }
    return null;
}

function updateTreeNode(node) {
    if (node.dom) {
        const badge = node.dom.querySelector(".tree-badge");
        if (badge) {
            badge.className = "tree-badge tree-badge-" + node.status;
            badge.textContent = node.status;
        }
        const reasonSpan = node.dom.querySelector(".tree-reason");
        if (reasonSpan) {
            reasonSpan.textContent = node.reason ? " (" + node.reason + ")" : "";
        }
    }
}

function renderTreeNode(node) {
    const div = document.createElement("div");
    div.className = "tree-row";
    div.style.paddingLeft = (node.depth * 24) + "px";
    
    const parts = node.key.split(":");
    const g = parts[0];
    const a = parts[1];
    const v = parts[2];
    const jarUrl = base(g, a, v) + "/" + a + "-" + v + ".jar";
    
    div.innerHTML = '<span class="tree-branch">' + (node.depth > 0 ? "\u251c\u2500 " : "") + '</span>'
        + '<span class="tree-key">' + node.key + '</span>'
        + ' <span class="tree-scope">' + (node.scope ? "[" + node.scope + "]" : "") + '</span>'
        + ' <span class="tree-badge tree-badge-' + node.status + '">' + node.status + '</span>'
        + (node.status === "resolved" ? ' <a href="' + jarUrl + '" target="_blank" style="color:#93c5fd;font-size:11px;">[link]</a>' : '')
        + '<span class="tree-reason">' + (node.reason ? " (" + node.reason + ")" : "") + '</span>';
    node.dom = div;
    return div;
}

function renderTreeRecursive(nodes, container) {
    for (const node of nodes) {
        container.appendChild(renderTreeNode(node));
        if (node.children.length > 0) {
            renderTreeRecursive(node.children, container);
        }
    }
}

function renderTree() {
    const treeDiv = document.getElementById("tree");
    if (!treeDiv) return;
    treeDiv.innerHTML = "";
    if (treeRoot && treeRoot.length > 0) {
        renderTreeRecursive(treeRoot, treeDiv);
    }
}

function log(cls, text, reason) {
    const logDiv = document.getElementById("log");
    const entry = document.createElement("div");
    entry.className = "log-entry";
    entry.innerHTML = '<span class="badge badge-' + cls + '">' + cls + '</span>'
        + '<span class="log-text">' + text
        + (reason ? ' <span class="log-reason">(' + reason + ')</span>' : '')
        + '</span>';
    logDiv.appendChild(entry);
    return entry;
}

function updateLog(entry, cls, text, reason) {
    entry.innerHTML = '<span class="badge badge-' + cls + '">' + cls + '</span>'
        + '<span class="log-text">' + text
        + (reason ? ' <span class="log-reason">(' + reason + ')</span>' : '')
        + '</span>';
}

function updateStats() {
    document.getElementById("statResolved").textContent = resolved;
    document.getElementById("statDownloaded").textContent = downloaded;
    document.getElementById("statSkipped").textContent = skipped;
    document.getElementById("statFailed").textContent = failed;
}

function base(g, a, v) {
    return "https://repo1.maven.org/maven2/"
        + g.replace(/\./g, "/")
        + "/"
        + a
        + "/"
        + v;
}

const proxyUrls = [
    "/.netlify/functions/fetch"
];

function getRandomProxyUrl() {
    return proxyUrls[Math.floor(Math.random() * proxyUrls.length)];
}

async function fetchText(url) {
    const proxy = getRandomProxyUrl();
    const r = await fetch(proxy + "?url=" + encodeURIComponent(url));
    if (!r.ok) throw new Error("fetch failed");
    return await r.text();
}

async function fetchBinary(url) {
    const proxy = getRandomProxyUrl();
    const r = await fetch(proxy + "?url=" + encodeURIComponent(url));
    if (!r.ok) throw new Error("fetch failed");
    return await r.arrayBuffer();
}

function extractVersionMap(xmlBlock) {
    const map = {};
    const regex = /<dependency>([\s\S]*?)<\/dependency>/g;
    let m;
    while ((m = regex.exec(xmlBlock)) !== null) {
        const block = m[1];
        const g = block.match(/<groupId>(.*?)<\/groupId>/);
        const a = block.match(/<artifactId>(.*?)<\/artifactId>/);
        const v = block.match(/<version>(.*?)<\/version>/);
        const s = block.match(/<scope>(.*?)<\/scope>/);
        if (g && a && v) {
            const key = g[1].trim() + ":" + a[1].trim();
            map[key] = { version: v[1].trim(), scope: s ? s[1].trim() : null };
        }
    }
    return map;
}

async function parsePom(xml) {
    const deps = [];
    const reasons = [];
    const versionMap = {};

    // current POM dependencyManagement
    const dmMatch = xml.match(/<dependencyManagement>([\s\S]*?)<\/dependencyManagement>/);
    if (dmMatch) {
        Object.assign(versionMap, extractVersionMap(dmMatch[1]));
    }

    // parent POM dependencyManagement
    const parentMatch = xml.match(/<parent>([\s\S]*?)<\/parent>/);
    if (parentMatch) {
        const pb = parentMatch[1];
        const pg = pb.match(/<groupId>(.*?)<\/groupId>/);
        const pa = pb.match(/<artifactId>(.*?)<\/artifactId>/);
        const pv = pb.match(/<version>(.*?)<\/version>/);
        if (pg && pa && pv) {
            try {
                const pBase = base(pg[1].trim(), pa[1].trim(), pv[1].trim());
                const pPomUrl = pBase + "/" + pa[1].trim() + "-" + pv[1].trim() + ".pom";
                const pXml = await fetchText(pPomUrl);
                const pDmMatch = pXml.match(/<dependencyManagement>([\s\S]*?)<\/dependencyManagement>/);
                if (pDmMatch) {
                    const parentMap = extractVersionMap(pDmMatch[1]);
                    for (const k in parentMap) {
                        if (!versionMap[k]) versionMap[k] = parentMap[k];
                    }
                }
            } catch (e) {
                // parent fetch failed
            }
        }
    }

    // strip dependencyManagement and build sections so their entries are not treated as deps
    let cleanXml = xml.replace(/<dependencyManagement>[\s\S]*?<\/dependencyManagement>/, "");
    cleanXml = cleanXml.replace(/<build>[\s\S]*?<\/build>/, "");

    const regex = /<dependency>([\s\S]*?)<\/dependency>/g;
    let m;

    while ((m = regex.exec(cleanXml)) !== null) {
        const block = m[1];

        const g = block.match(/<groupId>(.*?)<\/groupId>/);
        const a = block.match(/<artifactId>(.*?)<\/artifactId>/);
        const v = block.match(/<version>(.*?)<\/version>/);

        if (!g || !a) {
            const missing = [];
            if (!g) missing.push("groupId");
            if (!a) missing.push("artifactId");
            reasons.push({ reason: "missing " + missing.join(", ") });
            continue;
        }

        let version;
        if (v) {
            version = v[1].trim();
        } else {
            const key = g[1].trim() + ":" + a[1].trim();
            if (versionMap[key]) {
                version = versionMap[key].version;
            } else {
                reasons.push({ g: g[1].trim(), a: a[1].trim(), reason: "missing version, not in dependencyManagement" });
                continue;
            }
        }

        if (version.includes("${")) {
            reasons.push({ g: g[1].trim(), a: a[1].trim(), reason: "unresolved property version" });
            continue;
        }

        const s = block.match(/<scope>(.*?)<\/scope>/);
        let scope = "compile";
        if (s) {
            scope = s[1].trim();
        } else {
            const key = g[1].trim() + ":" + a[1].trim();
            if (versionMap[key] && versionMap[key].scope) {
                scope = versionMap[key].scope;
            }
        }
        if (scope === "test" || scope === "provided") {
            reasons.push({ g: g[1].trim(), a: a[1].trim(), reason: "scope=" + scope });
            continue;
        }

        const opt = block.match(/<optional>(.*?)<\/optional>/);
        if (opt && opt[1].trim() === "true") {
            reasons.push({ g: g[1].trim(), a: a[1].trim(), reason: "optional=true" });
            continue;
        }

        deps.push({
            g: g[1].trim(),
            a: a[1].trim(),
            v: version,
            scope: scope
        });
    }

    return { deps, reasons };
}

async function start() {
    const btn = document.getElementById("btn");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Resolving...';

    visited = new Set();
    downloaded = 0;
    skipped = 0;
    failed = 0;
    resolved = 0;
    artifactDepths = new Map();
    artifactVersions = new Map();
    resolvedDeps = [];
    const dependencyQueue = [];

    document.getElementById("log").innerHTML = "";
    document.getElementById("tree").innerHTML = "";
    treeRoot = null;
    treeStack = [];
    document.getElementById("statusCard").style.display = "block";
    document.getElementById("treeCard").style.display = "block";
    document.getElementById("logCard").style.display = "block";
    document.getElementById("btnDownload").style.display = "none";
    updateStats();

    const text = document.getElementById("deps").value;

    const regex =
        /<dependency>[\s\S]*?<groupId>(.*?)<\/groupId>[\s\S]*?<artifactId>(.*?)<\/artifactId>[\s\S]*?<version>(.*?)<\/version>[\s\S]*?<\/dependency>/g;

    let m;

    while ((m = regex.exec(text)) !== null) {
        dependencyQueue.push({ g: m[1].trim(), a: m[2].trim(), v: m[3].trim(), scope: "compile", depth: 0, parentKey: null });
    }

    // Resolve all dependencies with depths, building tree
    let idx = 0;
    while (idx < dependencyQueue.length) {
        const dep = dependencyQueue[idx++];
        const key = dep.g + ":" + dep.a + ":" + dep.v;
        if (visited.has(key)) continue;
        visited.add(key);

        const artifactKey = dep.g + ":" + dep.a;
        const existingDepth = artifactDepths.get(artifactKey);
        if (existingDepth !== undefined && dep.depth >= existingDepth) {
            skipped++;
            const winningVersion = artifactVersions.get(artifactKey);
            log("skip", "  ".repeat(dep.depth) + key, "conflict - version at depth " + existingDepth + " wins: " + winningVersion);
            addTreeNode(key, dep.depth, "omitted", "conflict - version " + winningVersion + " at depth " + existingDepth + " wins", dep.scope, dep.parentKey);
            continue;
        }
        artifactDepths.set(artifactKey, dep.depth);
        artifactVersions.set(artifactKey, dep.v);
        resolvedDeps.push(dep);
        resolved++;
        addTreeNode(key, dep.depth, "resolved", "", dep.scope, dep.parentKey);

        try {
            const b = base(dep.g, dep.a, dep.v);
            const pomUrl = b + "/" + dep.a + "-" + dep.v + ".pom";
            const pom = await fetchText(pomUrl);
            const result = await parsePom(pom);

            for (const r of result.reasons) {
                skipped++;
                if (r.g) {
                    log("skip", "  ".repeat(dep.depth + 1) + r.g + ":" + r.a, r.reason);
                } else {
                    log("skip", "  ".repeat(dep.depth + 1) + "dep", r.reason);
                }
            }

            for (const d of result.deps) {
                dependencyQueue.push({ g: d.g, a: d.a, v: d.v, scope: d.scope, depth: dep.depth + 1, parentKey: key });
            }
        } catch (e) {
            log("fail", "  ".repeat(dep.depth) + key, "pom not found");
        }
    }
    updateStats();

    log("info", "Resolved " + resolvedDeps.length + " artifacts");
    
    btn.disabled = false;
    btn.innerText = "Resolve Jars";
    document.getElementById("btnDownload").style.display = "inline-block";
}

async function downloadAll() {
    const btn = document.getElementById("btnDownload");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Downloading...';

    zip = new JSZip();
    downloaded = 0;
    failed = 0;
    updateStats();

    log("info", "Downloading " + resolvedDeps.length + " JARs...");

    for (let i = 0; i < resolvedDeps.length; i++) {
        const dep = resolvedDeps[i];
        const key = dep.g + ":" + dep.a + ":" + dep.v;
        const indent = "  ".repeat(dep.depth);
        const entry = log("resolve", indent + key);
        const b = base(dep.g, dep.a, dep.v);
        const jarUrl = b + "/" + dep.a + "-" + dep.v + ".jar";

        try {
            const jar = await fetchBinary(jarUrl);
            zip.file(dep.a + "-" + dep.v + ".jar", jar);
            downloaded++;
            updateLog(entry, "download", indent + key);
        } catch (e) {
            failed++;
            updateLog(entry, "fail", indent + key, "jar not found");
        }
        updateStats();

        const progress = ((i + 1) / resolvedDeps.length) * 100;
        document.getElementById("progressBar").style.width = progress + "%";
        document.getElementById("progressText").textContent = (i + 1) + " / " + resolvedDeps.length;
    }

    log("info", "Creating ZIP...");

    const content = await zip.generateAsync({ type: "blob" });

    const zipSizeBytes = content.size;
    const zipSizeMB = (zipSizeBytes / (1024 * 1024)).toFixed(2);
    document.getElementById("statZipSize").textContent = zipSizeMB + " MB";

    const a = document.createElement("a");
    a.href = URL.createObjectURL(content);
    a.download = "maven-jars.zip";
    a.click();

    log("info", "Done");

    btn.disabled = false;
    btn.innerText = "Download All as ZIP";
}

function generatePom() {
    const text = document.getElementById("deps").value;
    const pomContent = `<?xml version="1.0"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
    <modelVersion>4.0.0</modelVersion>
    <groupId>tmp</groupId>
    <artifactId>tmp</artifactId>
    <version>1.0</version>

    <dependencies>
${text}
    </dependencies>
</project>`;

    const blob = new Blob([pomContent], { type: "application/xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pom.xml";
    a.click();
}
