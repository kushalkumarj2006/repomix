const BACKEND_URL = "https://repomix-v2.onrender.com";
const defaultIgnorePatterns = `node_modules/
.git/
.DS_Store
dist/
build/
coverage/
*.min.js
__pycache__/
.env
.vscode/
.idea/
package-lock.json
yarn.lock
*.log
*.tmp
*.zip
*.tar
*.gz
*.jpg
*.jpeg
*.png
*.gif
*.ico
*.svg
*.mp4
*.webm
*.mp3
*.wav
*.pdf
*.doc
*.docx
*.exe
*.dll
*.so
*.bin
*.db`;

// ========== AUTHENTICATION SYSTEM ==========
let passphrase = localStorage.getItem("repomix_pass") || "";
let currentSessionId = null;

window.key = function(str) {
  if (str && str.trim()) {
    passphrase = str.trim();
    localStorage.setItem("repomix_pass", passphrase);
    console.log("✅ Authentication key saved!");
    return "Key saved successfully";
  }
  console.log("❌ Please provide a valid key");
  return "Invalid key";
};

// Add auth header to all fetch requests
function authenticatedFetch(url, options = {}) {
  const headers = options.headers || {};
  if (passphrase) {
    headers['X-Auth-Key'] = passphrase;
  }
  return fetch(url, { ...options, headers });
}

// ========== TEST FUNCTION ==========
window.test = async function() {
  if (!passphrase) {
    console.error("❌ No authentication key");
    return { error: "No authentication key" };
  }
  console.log("🔄 Testing Backend rate limits and sessions...\n");
  try {
    const response = await authenticatedFetch(`${BACKEND_URL}/test`, {
      method: 'GET'
    });
    if (!response.ok) {
      console.error(`❌ Test failed: HTTP ${response.status}`);
      if (response.status === 401) {
        console.error("   Unauthorized! Check your authentication key");
      }
      return { error: `HTTP ${response.status}` };
    }
    const data = await response.json();
    if (!data.success) {
      console.error(`❌ Test failed: ${data.error}`);
      return data;
    }
    console.log("📊 TOKEN STATUS:");
    console.log("-".repeat(80));
    console.log(`🌐 FREE TIER: ${data.anonymousFree} remaining requests`);
    console.log("-".repeat(80));
    const tokenData = data.tokens.filter(t => t.token);
    if (tokenData.length > 0) {
      console.table(tokenData.map(t => ({
        Token: t.token,
        Status: t.status,
        Remaining: t.remaining?.toLocaleString() || 'N/A',
        Limit: t.limit?.toLocaleString() || 'N/A',
        Used: t.used?.toLocaleString() || 'N/A'
      })));
    }
    console.log("\n👥 SESSION MANAGEMENT:");
    console.log("-".repeat(80));
    console.log(`Active Sessions: ${data.sessions.activeSessions}/${data.sessions.maxSessions}`);
    if (data.sessions.sessions && data.sessions.sessions.length > 0) {
      console.table(data.sessions.sessions.map(s => ({
        'Session ID': s.id.substring(0, 16) + '...',
        'Created': s.createdAt,
        'Last Accessed': s.lastAccessed,
        'Age (min)': s.ageMinutes
      })));
    } else {
      console.log("No active sessions");
    }
    console.log("\n💾 CACHE STATUS:");
    console.log("-".repeat(80));
    console.log(`Cache Size: ${data.cacheSize}/5 repositories`);
    console.log(`Compression: ${data.compression}`);
    console.log("\n✅ Test completed successfully!");
    return data;
  } catch (err) {
    console.error(`❌ Test failed: ${err.message}`);
    return { error: err.message };
  }
};

window.sessions = async function() {
  if (!passphrase) {
    console.error("❌ No authentication key set");
    return;
  }
  try {
    const response = await authenticatedFetch(`${BACKEND_URL}/test`, {
      method: 'GET'
    });
    const data = await response.json();
    if (data.sessions && data.sessions.sessions) {
      console.table(data.sessions.sessions.map(s => ({
        'Session ID': s.id.substring(0, 16) + '...',
        'Age (min)': s.ageMinutes,
        'Last Active': new Date(s.lastAccessed).toLocaleTimeString()
      })));
      console.log(`\nTotal: ${data.sessions.activeSessions}/${data.sessions.maxSessions} sessions`);
    }
  } catch (err) {
    console.error(`Failed to get sessions: ${err.message}`);
  }
};

// ========== DOM Elements ==========
const analyzeBtn = document.getElementById("analyzeBtn");
const previewBtn = document.getElementById("previewBtn");
const downloadZipBtn = document.getElementById("downloadZipBtn");
const resetBtn = document.getElementById("resetBtn");
const repoInput = document.getElementById("repoUrl");
const ignoreTextarea = document.getElementById("ignorePatterns");
const includeDirectoryStructure = document.getElementById("includeDirectoryStructure");
const showLineNumbers = document.getElementById("showLineNumbers");
const removeComments = document.getElementById("removeComments");
const removeEmptyLines = document.getElementById("removeEmptyLines");
const fileTreeContainer = document.getElementById("fileTreeContainer");
const selectionStatsSpan = document.getElementById("selectionStats");
const expandAllBtn = document.getElementById("expandAllBtn");
const collapseAllBtn = document.getElementById("collapseAllBtn");
const statusDiv = document.getElementById("statusMsg");
const analysisPanel = document.getElementById("analysisPanel");
const totalFilesFoundSpan = document.getElementById("totalFilesFound");
const totalSizeFoundSpan = document.getElementById("totalSizeFound");
const cacheStatusSpan = document.getElementById("cacheStatus");
const analysisDetailsDiv = document.getElementById("analysisDetails");
const outputContainer = document.getElementById("outputContainer");
const outputPre = document.getElementById("output");
const progressBar = document.getElementById("progressBar");
const copyOutputBtn = document.getElementById("copyOutputBtn");
const downloadTextBtn = document.getElementById("downloadTextBtn");
const selectedCountSpan = document.getElementById("selectedCount");
const selectedSizeSpan = document.getElementById("selectedSize");
const estimatedZipSizeSpan = document.getElementById("estimatedZipSize");
const btnGithub = document.getElementById("btnGithub");
const btnLocal = document.getElementById("btnLocal");
const btnZip = document.getElementById("btnZip");
const githubBlock = document.getElementById("githubBlock");
const localBlock = document.getElementById("localBlock");
const zipBlock = document.getElementById("zipBlock");
const folderPicker = document.getElementById("folderPicker");
const zipUpload = document.getElementById("zipUpload");

// ========== Global State ==========
let fileTreeData = null;
let allFilesMetadata = [];
let selectedFilesSet = new Set();
let expandedFolders = new Set();
let currentOwner = "";
let currentRepo = "";
let currentBranch = "";
let currentRepoId = null;
let currentSourceType = "github";
let loadedContentMap = new Map();
let isFromCache = false;
let currentTextContent = "";

ignoreTextarea.value = defaultIgnorePatterns;

// ========== Helper Functions ==========
function formatSize(bytes) {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function parseRepoInput(input) {
  let cleanInput = input.trim();
  cleanInput = cleanInput.replace(/\/$/, "");
  const urlMatch = cleanInput.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }
  const parts = cleanInput.split("/");
  if (parts.length === 2) {
    return { owner: parts[0], repo: parts[1] };
  }
  return null;
}

function showStatus(msg, type = "info") {
  statusDiv.innerHTML = msg;
  statusDiv.className = "status";
  if (type === "success") statusDiv.className = "status success";
  if (type === "error") statusDiv.className = "status error";
}

function showError(msg) {
  showStatus(`❌ ${msg}`, "error");
}

function getIgnorePatterns() {
  return ignoreTextarea.value.split(/\r?\n/)
    .filter(l => l.trim().length > 0)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

// ========== IMPROVED SHOULD IGNORE FUNCTION ==========
function shouldIgnore(filePath, patterns) {
  if (!patterns || patterns.length === 0) return false;
  
  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
  
  for (let pattern of patterns) {
    let normalizedPattern = pattern.toLowerCase().replace(/\\/g, '/');
    
    // Remove trailing slash if present
    const originalPattern = pattern;
    let isFolderPattern = originalPattern.endsWith('/');
    
    if (normalizedPattern.endsWith('/')) {
      normalizedPattern = normalizedPattern.slice(0, -1);
      isFolderPattern = true;
    }
    
    // Handle wildcard patterns
    if (normalizedPattern.includes('*')) {
      const regexPattern = '^' + normalizedPattern.replace(/\*/g, '.*') + '$';
      const regex = new RegExp(regexPattern);
      const fileName = normalizedPath.split('/').pop();
      if (regex.test(fileName)) {
        console.log(`  Ignored (wildcard): ${filePath} matches ${pattern}`);
        return true;
      }
    }
    
    // Check for exact folder match (with or without trailing slash)
    if (isFolderPattern) {
      const pathParts = normalizedPath.split('/');
      for (const part of pathParts) {
        if (part === normalizedPattern) {
          console.log(`  Ignored (folder): ${filePath} matches ${pattern}`);
          return true;
        }
      }
      if (normalizedPath.startsWith(normalizedPattern + '/')) {
        console.log(`  Ignored (folder prefix): ${filePath} matches ${pattern}`);
        return true;
      }
    } else {
      // Check for exact file match
      const fileName = normalizedPath.split('/').pop();
      if (fileName === normalizedPattern) {
        console.log(`  Ignored (file): ${filePath} matches ${pattern}`);
        return true;
      }
      // Check if any folder matches
      const pathParts = normalizedPath.split('/');
      for (const part of pathParts) {
        if (part === normalizedPattern) {
          console.log(`  Ignored (folder name): ${filePath} matches ${pattern}`);
          return true;
        }
      }
    }
  }
  return false;
}

function updateSelectionStats() {
  const selectedCount = selectedFilesSet.size;
  const selectedMetadata = allFilesMetadata.filter(f => selectedFilesSet.has(f.path));
  const totalChars = selectedMetadata.reduce((sum, f) => sum + (f.size || 0), 0);
  const totalKB = (totalChars / 1024).toFixed(1);
  const estimatedZipKB = (totalChars * 0.22 / 1024).toFixed(1);
  selectionStatsSpan.innerHTML = `📊 ${selectedCount} files selected (${totalKB} KB text, ~${estimatedZipKB} KB compressed)`;
  selectedCountSpan.innerText = selectedCount;
  selectedSizeSpan.innerText = totalKB;
  estimatedZipSizeSpan.innerText = estimatedZipKB;
}

// ========== File Tree Functions ==========
function computeFolderSize(node) {
  if (node.type === "file") return node.size || 0;
  let total = 0;
  for (const file of node.files) total += file.size || 0;
  for (const childName in node.children) total += computeFolderSize(node.children[childName]);
  node.totalSize = total;
  return total;
}

function getSelectedFolderSize(node) {
  if (node.type === "file") return selectedFilesSet.has(node.path) ? node.size || 0 : 0;
  let total = 0;
  for (const file of node.files) if (selectedFilesSet.has(file.path)) total += file.size || 0;
  for (const childName in node.children) total += getSelectedFolderSize(node.children[childName]);
  return total;
}

function buildFileTreeFromPaths(paths, rootName, fileSizes = new Map()) {
  const tree = { name: rootName, type: "folder", children: {}, files: [], path: rootName, totalSize: 0 };
  for (const path of paths) {
    const parts = path.split("/");
    let current = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (isLast) {
        current.files.push({ name: part, path: path, type: "file", size: fileSizes.get(path) || 0 });
      } else {
        if (!current.children[part]) {
          current.children[part] = { name: part, type: "folder", children: {}, files: [], path: current.path + "/" + part, totalSize: 0 };
        }
        current = current.children[part];
      }
    }
  }
  computeFolderSize(tree);
  return tree;
}

function setFolderSelection(folderNode, checked) {
  for (const file of folderNode.files) checked ? selectedFilesSet.add(file.path) : selectedFilesSet.delete(file.path);
  for (const childName in folderNode.children) setFolderSelection(folderNode.children[childName], checked);
}

function renderTree(node) {
  const isExpanded = expandedFolders.has(node.path);
  const hasChildren = Object.keys(node.children).length > 0 || node.files.length > 0;
  let html = `<div class="tree-node"><div class="tree-item">`;
  html += hasChildren ? `<span class="tree-toggle" data-toggle="${node.path}">${isExpanded ? "▼" : "▶"}</span>` : `<span class="tree-toggle empty"></span>`;
  let allSelected = true;
  for (const file of node.files) if (!selectedFilesSet.has(file.path)) { allSelected = false; break; }
  if (allSelected) {
    for (const childName in node.children) {
      for (const file of node.children[childName].files) {
        if (!selectedFilesSet.has(file.path)) { allSelected = false; break; }
      }
      if (!allSelected) break;
    }
  }
  const isFolderChecked = allSelected && (node.files.length > 0 || Object.keys(node.children).length > 0);
  const selectedSize = node.type === "folder" ? getSelectedFolderSize(node) : (selectedFilesSet.has(node.path) ? node.size || 0 : 0);
  const totalSize = node.type === "folder" ? node.totalSize || 0 : node.size || 0;
  const sizeDisplay = totalSize > 0 ? ` (${formatSize(selectedSize)}/${formatSize(totalSize)})` : "";
  html += `<input type="checkbox" class="tree-checkbox" data-folder="${node.path}" ${isFolderChecked ? "checked" : ""}>`;
  html += `<span class="tree-icon">${hasChildren ? "📁" : "📄"}</span>`;
  html += `<span class="tree-label" data-toggle="${node.path}">${node.name}</span>`;
  html += `<span class="tree-size">${sizeDisplay}</span></div>`;
  if (hasChildren && isExpanded) {
    html += `<div class="folder-content">`;
    for (const childName of Object.keys(node.children).sort()) html += renderTree(node.children[childName]);
    for (const file of node.files.sort((a, b) => a.name.localeCompare(b.name))) {
      const fileSelected = selectedFilesSet.has(file.path);
      html += `<div class="tree-node" style="margin-left: 20px;"><div class="tree-item"><span class="tree-toggle empty"></span><input type="checkbox" class="tree-checkbox" data-file="${file.path}" ${fileSelected ? "checked" : ""}><span class="tree-icon">📄</span><span class="tree-label">${file.name}</span><span class="tree-size">${formatSize(file.size)}</span></div></div>`;
    }
    html += `</div>`;
  }
  html += `</div>`;
  return html;
}

function attachTreeEvents() {
  document.querySelectorAll(".tree-toggle[data-toggle]").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const path = el.getAttribute("data-toggle");
      expandedFolders.has(path) ? expandedFolders.delete(path) : expandedFolders.add(path);
      refreshTreeDisplay();
    });
  });
  document.querySelectorAll(".tree-label[data-toggle]").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const path = el.getAttribute("data-toggle");
      expandedFolders.has(path) ? expandedFolders.delete(path) : expandedFolders.add(path);
      refreshTreeDisplay();
    });
  });
  document.querySelectorAll(".tree-checkbox[data-folder]").forEach(el => {
    el.addEventListener("change", (e) => {
      e.stopPropagation();
      const folderPath = el.getAttribute("data-folder");
      function findFolder(node, path) {
        if (node.path === path) return node;
        for (const childName in node.children) {
          const found = findFolder(node.children[childName], path);
          if (found) return found;
        }
        return null;
      }
      const folderNode = findFolder(fileTreeData, folderPath);
      if (folderNode) {
        setFolderSelection(folderNode, el.checked);
        refreshTreeDisplay();
        updateSelectionStats();
      }
    });
  });
  document.querySelectorAll(".tree-checkbox[data-file]").forEach(el => {
    el.addEventListener("change", (e) => {
      e.stopPropagation();
      const filePath = el.getAttribute("data-file");
      el.checked ? selectedFilesSet.add(filePath) : selectedFilesSet.delete(filePath);
      refreshTreeDisplay();
      updateSelectionStats();
    });
  });
}

function refreshTreeDisplay() {
  if (!fileTreeData) return;
  fileTreeContainer.innerHTML = renderTree(fileTreeData);
  attachTreeEvents();
}

function expandAllFolders(node = fileTreeData) {
  if (!node) return;
  expandedFolders.add(node.path);
  for (const childName in node.children) expandAllFolders(node.children[childName]);
  refreshTreeDisplay();
}

function collapseAllFolders(node = fileTreeData) {
  if (!node) return;
  expandedFolders.delete(node.path);
  for (const childName in node.children) collapseAllFolders(node.children[childName]);
  refreshTreeDisplay();
}

expandAllBtn.addEventListener("click", () => { if (fileTreeData) expandAllFolders(); });
collapseAllBtn.addEventListener("click", () => { if (fileTreeData) collapseAllFolders(); });

function resetPartial() {
  allFilesMetadata = [];
  selectedFilesSet.clear();
  expandedFolders.clear();
  fileTreeData = null;
  loadedContentMap.clear();
  currentTextContent = "";
  analysisPanel.style.display = "none";
  fileTreeContainer.innerHTML = '<div style="color:#64748b; text-align:center; padding:40px">🔍 Enter a GitHub repo and click "Analyze Repository"</div>';
  outputContainer.style.display = "none";
  updateSelectionStats();
  previewBtn.disabled = true;
  downloadZipBtn.disabled = true;
  progressBar.style.display = "none";
  currentRepoId = null;
}

function resetAll() {
  resetPartial();
  showStatus("", "");
}

resetBtn.addEventListener("click", resetAll);

function setSourceType(type) {
  currentSourceType = type;
  btnGithub.classList.toggle("active", type === "github");
  btnLocal.classList.toggle("active", type === "local");
  btnZip.classList.toggle("active", type === "zip");
  githubBlock.style.display = type === "github" ? "block" : "none";
  localBlock.style.display = type === "local" ? "block" : "none";
  zipBlock.style.display = type === "zip" ? "block" : "none";
  resetPartial();
}

btnGithub.addEventListener("click", () => setSourceType("github"));
btnLocal.addEventListener("click", () => setSourceType("local"));
btnZip.addEventListener("click", () => setSourceType("zip"));

// ========== BINARY DETECTION ==========
function isBinaryContent(content) {
  if (!content) return true;
  if (content.indexOf("\0") !== -1) return true;
  const binaryPattern = /[\x00-\x08\x0E-\x1F\x7F-\x9F]/;
  if (binaryPattern.test(content.substring(0, 1000))) return true;
  return false;
}

// ========== ENHANCED COMMENT REMOVAL ==========
function removeCommentsFromCodeLocal(code, filePath) {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (["js", "jsx", "ts", "tsx", "mjs", "cjs"].includes(ext)) {
    return code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  }
  if (ext === "py") {
    return code.replace(/#.*$/gm, "").replace(/'''[\s\S]*?'''/g, "").replace(/"""[\s\S]*?"""/g, "");
  }
  if (["html", "xml", "svg"].includes(ext)) {
    return code.replace(/<!--[\s\S]*?-->/g, "");
  }
  if (["css", "scss", "sass", "less"].includes(ext)) {
    return code.replace(/\/\*[\s\S]*?\*\//g, "");
  }
  if (ext === "json") {
    return code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  }
  if (["c", "cpp", "h", "hpp", "cc", "cxx"].includes(ext)) {
    return code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  }
  if (ext === "java") {
    return code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  }
  if (ext === "go") {
    return code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  }
  if (ext === "rs") {
    return code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  }
  if (ext === "rb") {
    return code.replace(/#.*$/gm, "").replace(/=begin[\s\S]*?=end/g, "");
  }
  if (ext === "php") {
    return code.replace(/\/\/.*$/gm, "").replace(/#.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  }
  if (ext === "sql") {
    return code.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  }
  if (ext === "cs") {
    return code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  }
  if (ext === "swift") {
    return code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  }
  if (ext === "kt" || ext === "kts") {
    return code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  }
  if (["sh", "bash", "zsh", "fish"].includes(ext)) {
    return code.replace(/#.*$/gm, "");
  }
  if (ext === "lua") {
    return code.replace(/--.*$/gm, "").replace(/--\[\[[\s\S]*?\]\]/g, "");
  }
  if (ext === "pl" || ext === "pm") {
    return code.replace(/#.*$/gm, "");
  }
  return code;
}

// ========== ASCII TREE BUILDER ==========
function buildAsciiTreeLocal(paths, showSizes = false, sizeMap = new Map()) {
  if (!paths.length) return "(empty)";
  const root = {};
  for (const p of paths) {
    const parts = p.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        if (!node._files) node._files = [];
        node._files.push({ name: part, size: sizeMap.get(p) || 0 });
      } else {
        if (!node[part]) node[part] = {};
        node = node[part];
      }
    }
  }
  function formatSizeLocal(bytes) {
    if (bytes === 0) return "";
    if (bytes < 1024) return ` (${bytes} B)`;
    if (bytes < 1024 * 1024) return ` (${(bytes / 1024).toFixed(1)} KB)`;
    return ` (${(bytes / (1024 * 1024)).toFixed(1)} MB)`;
  }
  function renderNode(node, prefix = "") {
    let lines = [];
    const dirs = Object.keys(node).filter(k => k !== "_files").sort();
    const files = node._files ? [...node._files].sort((a, b) => a.name.localeCompare(b.name)) : [];
    const items = [
      ...dirs.map(d => ({ type: "dir", name: d, size: 0 })),
      ...files.map(f => ({ type: "file", name: f.name, size: f.size }))
    ];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const isLast = i === items.length - 1;
      const connector = isLast ? "└── " : "├── ";
      const sizeDisplay = showSizes && item.size > 0 ? formatSizeLocal(item.size) : "";
      lines.push(`${prefix}${connector}${item.name}${item.type === "dir" ? "/" : ""}${sizeDisplay}`);
      if (item.type === "dir") {
        const childPrefix = prefix + (isLast ? "    " : "│   ");
        const childLines = renderNode(node[item.name], childPrefix);
        if (childLines) lines.push(childLines);
      }
    }
    return lines.join("\n");
  }
  const rootDirs = Object.keys(root).filter(k => k !== "_files").sort();
  const rootFiles = root._files ? [...root._files].sort((a, b) => a.name.localeCompare(b.name)) : [];
  const rootItems = [
    ...rootDirs.map(d => ({ type: "dir", name: d })),
    ...rootFiles.map(f => ({ type: "file", name: f.name }))
  ];
  let result = [];
  for (let i = 0; i < rootItems.length; i++) {
    const item = rootItems[i];
    const isLast = i === rootItems.length - 1;
    const connector = isLast ? "└── " : "├── ";
    result.push(`${connector}${item.name}${item.type === "dir" ? "/" : ""}`);
    if (item.type === "dir") {
      const childPrefix = isLast ? "    " : "│   ";
      const childLines = renderNode(root[item.name], childPrefix);
      if (childLines) result.push(childLines);
    }
  }
  return result.join("\n");
}

// ========== LOCAL FUNCTIONS ==========
function generateTextOutputLocal(files) {
  let output = "";
  output += "#".repeat(80) + "\n";
  output += `REPOMIX EXPORT\n`;
  output += `Source: ${currentSourceType === "local" ? "Local Folder" : "ZIP Archive"}\n`;
  output += `Generated: ${new Date().toLocaleString()}\n`;
  output += `Total files: ${files.length}\n`;
  output += `Total size: ${(files.reduce((s, f) => s + f.content.length, 0) / 1024).toFixed(1)} KB\n`;
  output += "#".repeat(80) + "\n\n";
  if (includeDirectoryStructure.checked) {
    const paths = files.map(f => f.path);
    const sizeMap = new Map(files.map(f => [f.path, f.content.length]));
    output += "DIRECTORY STRUCTURE\n";
    output += "-".repeat(80) + "\n";
    output += buildAsciiTreeLocal(paths, true, sizeMap) + "\n\n";
    output += "#".repeat(80) + "\n\n";
  }
  for (const file of files) {
    output += `\n${"#".repeat(80)}\n`;
    output += `File: ${file.path}\n`;
    output += `${"#".repeat(80)}\n\n`;
    let content = file.content;
    if (removeComments.checked) {
      content = removeCommentsFromCodeLocal(content, file.path);
    }
    if (removeEmptyLines.checked) {
      content = content.split("\n").filter(l => l.trim().length > 0).join("\n");
    }
    if (showLineNumbers.checked) {
      const lines = content.split("\n");
      const maxLineNum = lines.length.toString().length;
      content = lines.map((line, idx) => {
        const lineNum = (idx + 1).toString().padStart(maxLineNum, " ");
        return `${lineNum} | ${line}`;
      }).join("\n");
    }
    output += content + "\n";
  }
  output += "\n" + "#".repeat(80) + "\n";
  output += "END OF CODEBASE\n";
  output += "#".repeat(80) + "\n";
  return output;
}

async function fetchSelectedLocalZip() {
  const selectedPaths = Array.from(selectedFilesSet);
  if (selectedPaths.length === 0) {
    showError("No files selected");
    return;
  }
  showStatus(`📄 Generating preview for ${selectedPaths.length} local files...`, "");
  progressBar.style.display = "block";
  progressBar.value = 0;
  const fetched = [];
  for (let i = 0; i < selectedPaths.length; i++) {
    const path = selectedPaths[i];
    let content = loadedContentMap.get(path) || "";
    if (removeComments.checked) {
      content = removeCommentsFromCodeLocal(content, path);
    }
    if (removeEmptyLines.checked) {
      content = content.split("\n").filter(l => l.trim().length > 0).join("\n");
    }
    fetched.push({ path, content });
    progressBar.value = ((i + 1) / selectedPaths.length) * 100;
    await new Promise(r => setTimeout(r, 10));
  }
  progressBar.style.display = "none";
  currentTextContent = generateTextOutputLocal(fetched);
  outputPre.textContent = currentTextContent;
  outputContainer.style.display = "block";
  showStatus(`✅ Preview ready! ${fetched.length} files.`, "success");
}

async function downloadLocalZip() {
  const selectedPaths = Array.from(selectedFilesSet);
  if (selectedPaths.length === 0) {
    showError("No files selected");
    return;
  }
  showStatus(`📦 Creating ZIP for ${selectedPaths.length} files...`, "");
  progressBar.style.display = "block";
  const zip = new JSZip();
  for (let i = 0; i < selectedPaths.length; i++) {
    const path = selectedPaths[i];
    let content = loadedContentMap.get(path) || "";
    if (removeComments.checked) {
      content = removeCommentsFromCodeLocal(content, path);
    }
    if (removeEmptyLines.checked) {
      content = content.split("\n").filter(l => l.trim().length > 0).join("\n");
    }
    zip.file(path, content);
    progressBar.value = ((i + 1) / selectedPaths.length) * 100;
    await new Promise(r => setTimeout(r, 5));
  }
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 9 } });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `repomix_${currentSourceType}_${Date.now()}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  progressBar.style.display = "none";
  showStatus(`✅ Downloaded ${(blob.size / 1024).toFixed(1)} KB ZIP file!`, "success");
}

// ========== IMPROVED LOCAL FOLDER LOADING WITH IGNORE PATTERNS ==========
async function loadLocalFolder() {
  const files = Array.from(folderPicker.files);
  if (!files.length) {
    showError("Select a folder first");
    return;
  }
  showStatus("Reading local folder...", "");
  progressBar.style.display = "block";
  const results = [];
  const ignorePatterns = getIgnorePatterns();
  
  console.log("🔍 Local folder ignore patterns:", ignorePatterns);
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const relPath = file.webkitRelativePath || file.name;
    
    if (shouldIgnore(relPath, ignorePatterns)) {
      console.log(`  Ignored: ${relPath}`);
      progressBar.value = (i / files.length) * 100;
      continue;
    }
    
    try {
      const text = await file.text();
      if (!isBinaryContent(text)) {
        results.push({ path: relPath, content: text, size: text.length });
        if (results.length % 100 === 0) {
          console.log(`  Loaded ${results.length} files...`);
        }
      }
    } catch(e) {
      console.log(`Error reading ${relPath}: ${e.message}`);
    }
    progressBar.value = (i / files.length) * 100;
    await new Promise(r => setTimeout(r, 5));
  }
  
  progressBar.style.display = "none";
  
  if (results.length === 0) {
    showError("No valid text files found. Check your ignore patterns.");
    return;
  }
  
  console.log(`✅ Loaded ${results.length} files from local folder`);
  processLoadedFiles(results, "local folder");
}

// ========== IMPROVED ZIP LOADING WITH IGNORE PATTERNS ==========
async function loadZipArchive() {
  const zipFile = zipUpload.files[0];
  if (!zipFile) {
    showError("Select a ZIP file");
    return;
  }
  showStatus("Extracting ZIP...", "");
  progressBar.style.display = "block";
  try {
    const zip = await JSZip.loadAsync(zipFile);
    const allEntries = Object.keys(zip.files);
    const ignorePatterns = getIgnorePatterns();
    
    console.log("🔍 ZIP ignore patterns:", ignorePatterns);
    console.log(`📦 ZIP contains ${allEntries.length} entries`);
    
    const results = [];
    let processedCount = 0;
    
    for (let i = 0; i < allEntries.length; i++) {
      const filePath = allEntries[i];
      const entry = zip.files[filePath];
      
      if (entry.dir) continue;
      
      if (shouldIgnore(filePath, ignorePatterns)) {
        console.log(`  Ignored: ${filePath}`);
        processedCount++;
        progressBar.value = (processedCount / allEntries.length) * 100;
        continue;
      }
      
      try {
        const content = await entry.async("string");
        if (!isBinaryContent(content)) {
          results.push({ path: filePath, content: content, size: content.length });
          if (results.length % 100 === 0) {
            console.log(`  Loaded ${results.length} files...`);
          }
        }
      } catch(e) {
        console.log(`Error reading ${filePath}: ${e.message}`);
      }
      
      processedCount++;
      progressBar.value = (processedCount / allEntries.length) * 100;
      await new Promise(r => setTimeout(r, 5));
    }
    
    progressBar.style.display = "none";
    
    if (results.length === 0) {
      showError("No valid text files found in ZIP. Check your ignore patterns.");
      return;
    }
    
    console.log(`✅ Loaded ${results.length} files from ZIP`);
    processLoadedFiles(results, "ZIP archive");
  } catch (err) {
    progressBar.style.display = "none";
    showError(`ZIP error: ${err.message}`);
    console.error("ZIP loading error:", err);
  }
}

function processLoadedFiles(filesWithContent, sourceLabel) {
  if (!filesWithContent.length) {
    showError("No valid text files found");
    return;
  }
  
  allFilesMetadata = filesWithContent.map(f => ({ path: f.path, size: f.content.length }));
  loadedContentMap.clear();
  for (const f of filesWithContent) loadedContentMap.set(f.path, f.content);
  
  selectedFilesSet.clear();
  for (const f of allFilesMetadata) selectedFilesSet.add(f.path);
  expandedFolders.clear();
  
  const totalBytes = allFilesMetadata.reduce((s, f) => s + f.size, 0);
  totalFilesFoundSpan.innerText = allFilesMetadata.length;
  totalSizeFoundSpan.innerText = (totalBytes / 1024).toFixed(1) + " KB";
  cacheStatusSpan.innerText = "📁 Local";
  analysisDetailsDiv.innerHTML = `✅ Loaded ${allFilesMetadata.length} files from ${sourceLabel}`;
  analysisPanel.style.display = "block";
  
  const fileSizeMap = new Map();
  for (const f of filesWithContent) fileSizeMap.set(f.path, f.content.length);
  
  fileTreeData = buildFileTreeFromPaths(allFilesMetadata.map(f => f.path), sourceLabel.replace(/[^a-z0-9]/gi, "_"), fileSizeMap);
  expandedFolders.add(fileTreeData.path);
  refreshTreeDisplay();
  updateSelectionStats();
  previewBtn.disabled = false;
  downloadZipBtn.disabled = false;
  showStatus(`✅ Ready! ${allFilesMetadata.length} files loaded.`, "success");
  
  console.log("\n" + "=".repeat(80));
  console.log(`📁 Source: ${sourceLabel}`);
  console.log(`📊 Total Files: ${allFilesMetadata.length}`);
  console.log(`💾 Total Size: ${(totalBytes / 1024).toFixed(1)} KB`);
  console.log("=".repeat(80));
  console.log("\n📂 DIRECTORY STRUCTURE:\n");
  const paths = allFilesMetadata.map(f => f.path);
  console.log(buildAsciiTreeLocal(paths, true, fileSizeMap));
  console.log("\n" + "=".repeat(80));
}

// ========== GITHUB ANALYSIS ==========
async function analyzeGitHub() {
  if (!passphrase) {
    showError("Authentication required! Use key('your_secret') in console first");
    return;
  }
  let raw = repoInput.value.trim();
  if (!raw) {
    showError("Enter a GitHub repo");
    return;
  }
  const parsed = parseRepoInput(raw);
  if (!parsed) {
    showError('Invalid format. Use "owner/repo" or full GitHub URL');
    return;
  }
  currentOwner = parsed.owner;
  currentRepo = parsed.repo;
  showStatus(`📊 Analyzing ${currentOwner}/${currentRepo}...`, "");
  fileTreeContainer.innerHTML = '<div style="color:#64748b; text-align:center; padding:40px;">📊 Analyzing file tree...</div>';
  outputContainer.style.display = "none";
  progressBar.style.display = "block";
  progressBar.value = 20;
  try {
    const ignorePatterns = getIgnorePatterns();
    console.log("📤 Sending to server - Owner:", currentOwner, "Repo:", currentRepo);
    console.log("🚫 Ignore patterns:", ignorePatterns);
    
    const response = await authenticatedFetch(`${BACKEND_URL}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner: currentOwner,
        repo: currentRepo,
        branch: 'main',
        ignorePatterns: ignorePatterns,
        sessionId: currentSessionId
      })
    });
    
    if (response.status === 401) {
      throw new Error("Unauthorized! Check your authentication key");
    }
    if (!response.ok) {
      throw new Error(`Analysis failed: ${response.status}`);
    }
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error);
    }
    currentRepoId = data.repoId;
    currentBranch = 'main';
    currentSessionId = data.sessionId;
    isFromCache = data.fromCache || false;
    allFilesMetadata = Object.entries(data.fileTree).map(([path, size]) => ({ path, size }));
    totalFilesFoundSpan.innerText = allFilesMetadata.length;
    totalSizeFoundSpan.innerText = data.totalSizeKB + " KB";
    cacheStatusSpan.innerText = isFromCache ? "✅ Cached" : "🆕 Fresh";
    analysisDetailsDiv.innerHTML = `✅ Found ${allFilesMetadata.length} files<br>🔗 Repo ID: ${currentRepoId}<br>${isFromCache ? '💾 Served from cache (instant!)' : '🌐 Fetched from GitHub'}<br>🔑 Session: ${currentSessionId.substring(0, 16)}...`;
    analysisPanel.style.display = "block";
    selectedFilesSet.clear();
    for (const file of allFilesMetadata) selectedFilesSet.add(file.path);
    expandedFolders.clear();
    const fileSizeMap = new Map();
    for (const [path, size] of Object.entries(data.fileTree)) {
      fileSizeMap.set(path, size);
    }
    fileTreeData = buildFileTreeFromPaths(allFilesMetadata.map(f => f.path), `${currentOwner}_${currentRepo}`, fileSizeMap);
    expandedFolders.add(fileTreeData.path);
    refreshTreeDisplay();
    updateSelectionStats();
    previewBtn.disabled = false;
    downloadZipBtn.disabled = false;
    progressBar.style.display = "none";
    showStatus(`✅ Analysis complete! ${allFilesMetadata.length} files found.`, "success");
    
    const totalSizeBytes = allFilesMetadata.reduce((sum, f) => sum + f.size, 0);
    console.log("\n" + "=".repeat(80));
    console.log(`📊 Repository: ${currentOwner}/${currentRepo}`);
    console.log(`📁 Total Files: ${allFilesMetadata.length}`);
    console.log(`💾 Total Size: ${(totalSizeBytes / 1024).toFixed(1)} KB`);
    console.log(`🔑 Session: ${currentSessionId}`);
    console.log("=".repeat(80));
    console.log("\n📂 DIRECTORY STRUCTURE:\n");
    const paths = allFilesMetadata.map(f => f.path);
    console.log(buildAsciiTreeLocal(paths, true, fileSizeMap));
    console.log("\n" + "=".repeat(80));
  } catch (err) {
    progressBar.style.display = "none";
    showError(`Analysis failed: ${err.message}`);
    fileTreeContainer.innerHTML = '<div style="color:#64748b; text-align:center; padding:40px;">❌ Analysis failed. Check repo name and authentication.</div>';
  }
}

// ========== GITHUB GENERATION FUNCTIONS ==========
async function generatePreview() {
  if (!passphrase) {
    showError("Authentication required! Use key('your_secret') in console first");
    return;
  }
  const selectedPaths = Array.from(selectedFilesSet);
  if (selectedPaths.length === 0) {
    showError("No files selected");
    return;
  }
  previewBtn.disabled = true;
  showStatus(`📄 Generating preview for ${selectedPaths.length} files...`, "");
  progressBar.style.display = "block";
  progressBar.value = 0;
  try {
    const response = await authenticatedFetch(`${BACKEND_URL}/api/generate-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner: currentOwner,
        repo: currentRepo,
        branch: currentBranch,
        selectedPaths: selectedPaths,
        repoId: currentRepoId,
        includeDirStructure: includeDirectoryStructure.checked,
        showLineNumbers: showLineNumbers.checked,
        removeComments: removeComments.checked,
        removeEmptyLines: removeEmptyLines.checked,
        chunkIndex: 0,
        sessionId: currentSessionId
      })
    });
    if (response.status === 401) {
      throw new Error("Unauthorized! Check your authentication key");
    }
    if (!response.ok) {
      throw new Error(`Generation failed: ${response.status}`);
    }
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      if (data.success && data.content) {
        currentTextContent = data.content;
        outputPre.textContent = currentTextContent;
        outputContainer.style.display = "block";
        progressBar.style.display = "none";
        showStatus(`✅ Preview ready! ${selectedPaths.length} files.`, "success");
      } else {
        throw new Error(data.error || "Failed to generate preview");
      }
    } else {
      const totalChunks = parseInt(response.headers.get('X-Total-Chunks'));
      const totalSize = parseInt(response.headers.get('X-Total-Size'));
      const sessionId = response.headers.get('X-Session-Id');
      const hasMore = response.headers.get('X-Has-More') === 'true';
      const firstChunk = await response.arrayBuffer();
      const chunks = [new Uint8Array(firstChunk)];
      if (hasMore) {
        showStatus(`📥 Downloading ${totalChunks} chunks (${(totalSize / 1024 / 1024).toFixed(2)} MB)...`);
        for (let i = 1; i < totalChunks; i++) {
          const chunkResponse = await authenticatedFetch(`${BACKEND_URL}/api/generate-text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              owner: currentOwner,
              repo: currentRepo,
              branch: currentBranch,
              selectedPaths: selectedPaths,
              repoId: currentRepoId,
              includeDirStructure: includeDirectoryStructure.checked,
              showLineNumbers: showLineNumbers.checked,
              removeComments: removeComments.checked,
              removeEmptyLines: removeEmptyLines.checked,
              chunkIndex: i,
              sessionId: sessionId
            })
          });
          const chunkData = await chunkResponse.arrayBuffer();
          chunks.push(new Uint8Array(chunkData));
          progressBar.value = (i / totalChunks) * 100;
        }
      }
      progressBar.value = 100;
      showStatus(`📦 Decompressing archive...`);
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const compressedData = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        compressedData.set(chunk, offset);
        offset += chunk.length;
      }
      try {
        const decompressed = pako.inflate(compressedData, { to: 'string' });
        currentTextContent = decompressed;
      } catch(e) {
        const decoder = new TextDecoder('utf-8');
        currentTextContent = decoder.decode(compressedData);
      }
      outputPre.textContent = currentTextContent;
      outputContainer.style.display = "block";
      progressBar.style.display = "none";
      showStatus(`✅ Preview ready! ${selectedPaths.length} files.`, "success");
    }
  } catch (err) {
    progressBar.style.display = "none";
    showError(`Generation failed: ${err.message}`);
    console.error("Generation error:", err);
  } finally {
    previewBtn.disabled = false;
  }
}

async function downloadZipFile() {
  if (!passphrase) {
    showError("Authentication required! Use key('your_secret') in console first");
    return;
  }
  const selectedPaths = Array.from(selectedFilesSet);
  if (selectedPaths.length === 0) {
    showError("No files selected");
    return;
  }
  downloadZipBtn.disabled = true;
  showStatus(`📦 Preparing ZIP for ${selectedPaths.length} files...`, "");
  progressBar.style.display = "block";
  progressBar.value = 0;
  try {
    const response = await authenticatedFetch(`${BACKEND_URL}/api/generate-zip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner: currentOwner,
        repo: currentRepo,
        branch: currentBranch,
        selectedPaths: selectedPaths,
        repoId: currentRepoId,
        includeDirStructure: includeDirectoryStructure.checked,
        showLineNumbers: showLineNumbers.checked,
        removeComments: removeComments.checked,
        removeEmptyLines: removeEmptyLines.checked,
        chunkIndex: 0,
        sessionId: currentSessionId
      })
    });
    if (response.status === 401) {
      throw new Error("Unauthorized! Check your authentication key");
    }
    if (!response.ok) {
      throw new Error(`Generation failed: ${response.status}`);
    }
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/zip')) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `repomix_${currentOwner}_${currentRepo}_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
      showStatus(`✅ Downloaded ${sizeMB} MB ZIP file!`, "success");
      progressBar.style.display = "none";
      return;
    }
    const totalChunks = parseInt(response.headers.get('X-Total-Chunks'));
    const totalSize = parseInt(response.headers.get('X-Total-Size'));
    const sessionId = response.headers.get('X-Session-Id');
    const hasMore = response.headers.get('X-Has-More') === 'true';
    const firstChunk = await response.arrayBuffer();
    const chunks = [new Uint8Array(firstChunk)];
    if (hasMore) {
      showStatus(`📥 Downloading ${totalChunks} chunks (${(totalSize / 1024 / 1024).toFixed(2)} MB ZIP)...`);
      for (let i = 1; i < totalChunks; i++) {
        const chunkResponse = await authenticatedFetch(`${BACKEND_URL}/api/generate-zip`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner: currentOwner,
            repo: currentRepo,
            branch: currentBranch,
            selectedPaths: selectedPaths,
            repoId: currentRepoId,
            includeDirStructure: includeDirectoryStructure.checked,
            showLineNumbers: showLineNumbers.checked,
            removeComments: removeComments.checked,
            removeEmptyLines: removeEmptyLines.checked,
            chunkIndex: i,
            sessionId: sessionId
          })
        });
        const chunkData = await chunkResponse.arrayBuffer();
        chunks.push(new Uint8Array(chunkData));
        progressBar.value = (i / totalChunks) * 100;
      }
    }
    progressBar.value = 100;
    showStatus(`📦 Assembling ZIP file...`);
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const zipBytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      zipBytes.set(chunk, offset);
      offset += chunk.length;
    }
    const blob = new Blob([zipBytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `repomix_${currentOwner}_${currentRepo}_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
    showStatus(`✅ Downloaded ${sizeMB} MB ZIP file!`, "success");
    progressBar.style.display = "none";
  } catch (err) {
    progressBar.style.display = "none";
    showError(`Generation failed: ${err.message}`);
    console.error("Generation error:", err);
  } finally {
    downloadZipBtn.disabled = false;
  }
}

// ========== MAIN HANDLER ==========
async function analyzeRepository() {
  if (currentSourceType === "github") {
    await analyzeGitHub();
  } else if (currentSourceType === "local") {
    await loadLocalFolder();
  } else if (currentSourceType === "zip") {
    await loadZipArchive();
  }
}

async function handlePreview() {
  if (currentSourceType === "github") {
    await generatePreview();
  } else {
    await fetchSelectedLocalZip();
  }
}

async function handleDownloadZip() {
  if (currentSourceType === "github") {
    await downloadZipFile();
  } else {
    await downloadLocalZip();
  }
}

// ========== EVENT LISTENERS ==========
analyzeBtn.addEventListener("click", analyzeRepository);
previewBtn.addEventListener("click", handlePreview);
downloadZipBtn.addEventListener("click", handleDownloadZip);

folderPicker.addEventListener("change", () => {
  setSourceType("local");
  analyzeRepository();
});

zipUpload.addEventListener("change", () => {
  setSourceType("zip");
  analyzeRepository();
});

downloadTextBtn.addEventListener("click", () => {
  if (!currentTextContent) {
    showError("No text content to download");
    return;
  }
  const blob = new Blob([currentTextContent], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `repomix_${currentOwner || 'export'}_${currentRepo || Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showStatus(`✅ Downloaded text file (${(blob.size / 1024).toFixed(1)} KB)`, "success");
});

copyOutputBtn.addEventListener("click", async () => {
  const outputText = outputPre.textContent;
  try {
    await navigator.clipboard.writeText(outputText);
    copyOutputBtn.textContent = "✅ Copied!";
    copyOutputBtn.classList.add("copied");
    setTimeout(() => {
      copyOutputBtn.textContent = "📋 Copy";
      copyOutputBtn.classList.remove("copied");
    }, 2000);
  } catch (err) {
    copyOutputBtn.textContent = "❌ Failed";
    setTimeout(() => { copyOutputBtn.textContent = "📋 Copy"; }, 2000);
  }
});

console.log("🚀 Repomix is ready!");
console.log(`📡 Backend URL: ${BACKEND_URL}`);
console.log("🔐 To authenticate, use: key('your_secret_key')");
console.log("🧪 To test backend, use: test()");
console.log("👥 To view sessions, use: sessions()");
console.log("📁 Ignore patterns support: node_modules/, *.min.js, .git/, etc.");
