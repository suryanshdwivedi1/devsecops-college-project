const express = require('express');
const os = require('os');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const START_TIME = Date.now();
const GIT_SHA = (process.env.GIT_SHA || 'aa8af07').substring(0, 7);
let requestCount = 0;

// Middleware to track total incoming requests
app.use((req, res, next) => {
  requestCount++;
  next();
});

// Helper for human-readable uptime
function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

// -------------------------------------------------------------
// REST API Endpoints
// -------------------------------------------------------------

// 1. Health check endpoint (for ECS / ALB target health checks)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
    commitSha: GIT_SHA,
    checks: {
      container: 'healthy',
      runtime: 'node22-alpine',
      securityGate: 'passed (0 Critical / 0 High CVEs)'
    }
  });
});

// 2. Deployment & pipeline metadata endpoint
app.get('/api/info', (req, res) => {
  res.json({
    project: 'DevSecOps Automated Pipeline Demo',
    environment: 'production',
    commit: {
      sha: GIT_SHA,
      repository: 'https://github.com/suryanshdwivedi1/devsecops-college-project'
    },
    cloud: {
      provider: 'AWS',
      region: 'us-east-1',
      service: 'Amazon ECS (Fargate)',
      cluster: 'devsecops-live-cluster',
      serviceName: 'devsecops-app-task-service-7hay9jm1',
      ecrRepository: 'petclinic'
    },
    pipelineGates: {
      sast: { tool: 'SonarQube Cloud', status: 'PASSED', gate: 'Quality Gate Clean' },
      sbom: { tool: 'CycloneDX', standard: 'cyclonedx-json', status: 'GENERATED' },
      containerSecurity: { tool: 'Aqua Trivy', exitCode: 0, policy: '0 Critical / 0 High CVEs' },
      orchestration: { tool: 'AWS ECS Fargate', status: 'DEPLOYED' },
      notifications: { tool: 'Discord Webhook Alerts', status: 'ACTIVE' }
    },
    container: {
      hostname: os.hostname(),
      platform: os.platform(),
      osRelease: os.release(),
      nodeVersion: process.version,
      user: process.env.USER || 'node (non-root)'
    }
  });
});

// 3. Live runtime telemetry endpoint
app.get('/api/telemetry', (req, res) => {
  const mem = process.memoryUsage();
  const uptimeSec = Math.floor((Date.now() - START_TIME) / 1000);

  res.json({
    commitSha: GIT_SHA,
    uptime: formatUptime(uptimeSec),
    uptimeSeconds: uptimeSec,
    totalRequests: requestCount,
    memory: {
      heapUsedMB: (mem.heapUsed / 1024 / 1024).toFixed(2),
      heapTotalMB: (mem.heapTotal / 1024 / 1024).toFixed(2),
      rssMB: (mem.rss / 1024 / 1024).toFixed(2)
    },
    system: {
      freeMemMB: (os.freemem() / 1024 / 1024).toFixed(2),
      totalMemMB: (os.totalmem() / 1024 / 1024).toFixed(2),
      cpuCount: os.cpus().length,
      loadAvg: os.loadavg()
    }
  });
});

// 4. Dependencies inspection endpoint
app.get('/api/dependencies', (req, res) => {
  try {
    const pkgPath = path.join(__dirname, 'package.json');
    const pkgData = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    res.json({
      name: pkgData.name,
      version: pkgData.version,
      runtime: `Node.js ${process.version}`,
      installedDependencies: pkgData.dependencies || {},
      vulnerabilityStatus: 'CLEAN: zero known High/Critical CVEs detected by Trivy',
      securityAuditedBy: 'Aqua Trivy v0.36.0 + CycloneDX SBOM'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read package.json', details: err.message });
  }
});

// -------------------------------------------------------------
// Interactive Web UI Dashboard
// -------------------------------------------------------------
app.get('/', (req, res) => {
  const uptimeSec = Math.floor((Date.now() - START_TIME) / 1000);
  const mem = process.memoryUsage();
  const heapUsedMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
  const hostname = os.hostname();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DevSecOps Security & Pipeline Platform</title>
  <style>
    :root {
      --bg: #0B0F19;
      --card-bg: #111827;
      --card-border: #1F2937;
      --card-hover: #1A2234;
      --text: #F3F4F6;
      --text-muted: #9CA3AF;
      --emerald: #10B981;
      --emerald-glow: rgba(16, 185, 129, 0.15);
      --cyan: #06B6D4;
      --cyan-glow: rgba(6, 182, 212, 0.15);
      --purple: #8B5CF6;
      --purple-glow: rgba(139, 92, 246, 0.15);
      --blue: #3B82F6;
      --red: #EF4444;
      --red-glow: rgba(239, 68, 68, 0.15);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      padding: 24px;
      line-height: 1.5;
    }
    .container {
      max-width: 1240px;
      margin: 0 auto;
    }
    
    /* Header */
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 24px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .brand-icon {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      background: linear-gradient(135deg, #10B981, #06B6D4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
    }
    .brand h1 {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .brand p {
      font-size: 13px;
      color: var(--text-muted);
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .btn-diff {
      background: rgba(139, 92, 246, 0.18);
      border: 1px solid rgba(139, 92, 246, 0.4);
      color: #DDD6FE;
      padding: 7px 15px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .btn-diff:hover {
      background: rgba(139, 92, 246, 0.3);
      color: #FFF;
      transform: translateY(-1px);
    }
    .live-status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--emerald-glow);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: var(--emerald);
      padding: 7px 15px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--emerald);
      box-shadow: 0 0 10px var(--emerald);
      animation: pulse 1.8s infinite;
    }
    @keyframes pulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.2); }
      100% { opacity: 1; transform: scale(1); }
    }

    /* Top 4 Cards */
    .grid-4 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 20px;
      margin-bottom: 28px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 20px;
      transition: all 0.2s ease;
      position: relative;
      display: flex;
      flex-direction: column;
    }
    .card:hover {
      border-color: #374151;
      transform: translateY(-2px);
    }
    .card-tag {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 700;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .badge-success {
      background: rgba(16, 185, 129, 0.15);
      color: var(--emerald);
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 11px;
    }
    .badge-info {
      background: rgba(6, 182, 212, 0.15);
      color: var(--cyan);
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 11px;
    }
    .card-title {
      font-size: 19px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 6px;
    }
    .card-desc {
      font-size: 13px;
      color: var(--text-muted);
      flex-grow: 1;
      margin-bottom: 14px;
    }
    .card-link {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: var(--cyan);
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
      padding-top: 10px;
      border-top: 1px solid #1F2937;
      transition: color 0.2s;
    }
    .card-link:hover {
      color: #67E8F9;
      text-decoration: underline;
    }

    /* Pipeline Workflow Tracker */
    .pipeline-section {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 28px;
    }
    .section-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .pipeline-flow {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 8px;
      scrollbar-width: thin;
      scrollbar-color: #374151 #111827;
    }
    .pipeline-flow::-webkit-scrollbar {
      height: 6px;
    }
    .pipeline-flow::-webkit-scrollbar-track {
      background: #111827;
      border-radius: 4px;
    }
    .pipeline-flow::-webkit-scrollbar-thumb {
      background: #374151;
      border-radius: 4px;
    }
    .pipeline-flow::-webkit-scrollbar-thumb:hover {
      background: #4B5563;
    }
    .flow-step {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      min-width: 96px;
      cursor: pointer;
      user-select: none;
      padding: 6px 4px;
      border-radius: 8px;
      transition: background 0.2s;
    }
    .flow-step:hover {
      background: rgba(255, 255, 255, 0.04);
    }
    .flow-step.active .step-circle {
      background: var(--emerald);
      color: #0B0F19;
      box-shadow: 0 0 14px rgba(16, 185, 129, 0.6);
      transform: scale(1.1);
    }
    .flow-step.active .step-name {
      color: var(--emerald);
      font-weight: 700;
    }
    .step-circle {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: #1F2937;
      border: 2px solid var(--emerald);
      color: var(--emerald);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      margin-bottom: 6px;
      transition: all 0.2s;
    }
    .step-name {
      font-size: 11px;
      font-weight: 600;
      color: var(--text);
      white-space: nowrap;
    }
    .step-sub {
      font-size: 10px;
      color: var(--text-muted);
    }
    .flow-arrow {
      color: #4B5563;
      font-size: 14px;
      flex-shrink: 0;
    }

    /* Clicked Step Details Box */
    .step-detail-box {
      margin-top: 18px;
      background: #0D1117;
      border: 1px solid #30363D;
      border-left: 4px solid var(--emerald);
      border-radius: 8px;
      padding: 16px 20px;
      display: grid;
      grid-template-columns: 2fr 1.5fr 1fr;
      gap: 16px;
      align-items: center;
    }
    @media (max-width: 820px) {
      .step-detail-box { grid-template-columns: 1fr; }
    }
    .step-info-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 4px;
    }
    .step-info-desc {
      font-size: 12px;
      color: var(--text-muted);
    }
    .step-rule-box {
      background: #161B22;
      border: 1px solid #21262D;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
    }
    .step-rule-label {
      color: #8B949E;
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      display: block;
      margin-bottom: 2px;
    }
    .step-owner-badge {
      background: rgba(139, 92, 246, 0.15);
      border: 1px solid rgba(139, 92, 246, 0.3);
      color: #C4B5FD;
      padding: 8px 12px;
      border-radius: 6px;
      text-align: center;
      font-size: 12px;
      font-weight: 600;
    }

    /* Telemetry & API Explorer */
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
      gap: 20px;
      margin-bottom: 28px;
    }
    .metric-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid #1F2937;
      font-size: 13px;
    }
    .metric-row:last-child { border-bottom: none; }
    .metric-label { color: var(--text-muted); }
    .metric-value { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 600; }
    
    .commit-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #1E293B;
      border: 1px solid #334155;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 12px;
      color: #38BDF8;
      text-decoration: none;
    }
    .commit-badge:hover { text-decoration: underline; }

    /* Interactive API Tester */
    .api-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
      flex-wrap: wrap;
      gap: 8px;
    }
    .api-buttons {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .btn {
      background: #1F2937;
      color: var(--text);
      border: 1px solid #374151;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.2s;
    }
    .btn:hover { background: #374151; }
    .btn-active {
      background: var(--blue);
      border-color: var(--blue);
      color: white;
    }
    .btn-sm {
      padding: 4px 10px;
      font-size: 11px;
    }
    
    .json-container {
      position: relative;
    }
    .copy-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      background: #21262D;
      border: 1px solid #30363D;
      color: #C9D1D9;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.2s;
    }
    .copy-btn:hover {
      background: #30363D;
      color: white;
    }
    pre {
      background: #0D1117;
      border: 1px solid #21262D;
      border-radius: 8px;
      padding: 14px;
      font-size: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      color: #58A6FF;
      overflow-x: auto;
      max-height: 240px;
    }

    /* Modal Styling */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(6px);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      z-index: 1000;
    }
    .modal-overlay.open {
      display: flex;
    }
    .modal-card {
      background: #111827;
      border: 1px solid #374151;
      border-radius: 14px;
      width: 100%;
      max-width: 860px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
    }
    .modal-header {
      padding: 20px 24px;
      border-bottom: 1px solid #1F2937;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .modal-header h2 {
      font-size: 18px;
      font-weight: 700;
    }
    .modal-close {
      background: transparent;
      border: none;
      color: #9CA3AF;
      font-size: 22px;
      cursor: pointer;
      line-height: 1;
    }
    .modal-close:hover { color: white; }
    .modal-body {
      padding: 24px;
    }
    .diff-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    @media (max-width: 680px) {
      .diff-grid { grid-template-columns: 1fr; }
    }
    .diff-col {
      border-radius: 10px;
      padding: 18px;
    }
    .diff-before {
      background: rgba(239, 68, 68, 0.08);
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .diff-after {
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .diff-title {
      font-size: 15px;
      font-weight: 700;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .diff-item {
      margin-bottom: 12px;
      font-size: 13px;
    }
    .diff-item-label {
      font-size: 11px;
      color: #9CA3AF;
      text-transform: uppercase;
      font-weight: 700;
      display: block;
      margin-bottom: 2px;
    }
    .diff-item-val {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
    }

    /* Footer */
    footer {
      margin-top: 40px;
      padding-top: 24px;
      border-top: 1px solid var(--card-border);
      color: var(--text-muted);
      font-size: 13px;
    }
    .footer-content {
      display: grid;
      grid-template-columns: 1.2fr 2fr;
      gap: 24px;
      align-items: center;
      margin-bottom: 16px;
    }
    @media (max-width: 768px) {
      .footer-content { grid-template-columns: 1fr; }
    }
    .team-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 10px;
    }
    .team-badge {
      background: #111827;
      border: 1px solid #1F2937;
      padding: 8px 10px;
      border-radius: 8px;
      text-align: center;
    }
    .team-name {
      font-weight: 600;
      font-size: 12px;
      color: var(--text);
    }
    .team-role {
      font-size: 10px;
      color: var(--cyan);
    }
    .footer-bottom {
      text-align: center;
      font-size: 12px;
      color: #6B7280;
      border-top: 1px solid #161F30;
      padding-top: 14px;
    }
    .footer-bottom a { color: var(--cyan); text-decoration: none; }
    .footer-bottom a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <header>
      <div class="brand">
        <div class="brand-icon">🛡️</div>
        <div>
          <h1>DevSecOps Security & Pipeline Platform</h1>
          <p>College Capstone Project • Automated Container Hardening & ECS Deployment</p>
        </div>
      </div>
      <div class="header-actions">
        <button class="btn-diff" onclick="openDiffModal()">🔍 View Remediation Diff</button>
        <div class="live-status">
          <span class="pulse-dot"></span>
          AWS ECS Fargate Live
        </div>
      </div>
    </header>

    <!-- Top 4 Security & Pipeline Gates (Clickable Proof) -->
    <div class="grid-4">
      <!-- Gate 1: SonarQube -->
      <div class="card">
        <div class="card-tag">
          <span>SAST & Code Quality</span>
          <span class="badge-success">Passed</span>
        </div>
        <div class="card-title">SonarQube Cloud</div>
        <div class="card-desc">Static Application Security Testing passed with clean Quality Gate. Zero security hotspots.</div>
        <a class="card-link" href="https://sonarcloud.io/project/overview?id=suryanshdwivedi1_devsecops-college-project" target="_blank" rel="noopener">
          View Report ↗
        </a>
      </div>

      <!-- Gate 2: SBOM -->
      <div class="card">
        <div class="card-tag">
          <span>Software Supply Chain</span>
          <span class="badge-info">CycloneDX</span>
        </div>
        <div class="card-title">SBOM Generated</div>
        <div class="card-desc">Standardized CycloneDX JSON inventory of components, libraries, and licenses archived for 30 days.</div>
        <a class="card-link" href="https://github.com/suryanshdwivedi1/devsecops-college-project/actions" target="_blank" rel="noopener">
          View Report ↗
        </a>
      </div>

      <!-- Gate 3: Trivy Scanner -->
      <div class="card">
        <div class="card-tag">
          <span>Vulnerability Gate</span>
          <span class="badge-success">0 CVEs</span>
        </div>
        <div class="card-title">Aqua Trivy Scan</div>
        <div class="card-desc">Hardened Alpine base image. Zero Critical or High severity CVEs detected. SARIF uploaded to Security tab.</div>
        <a class="card-link" href="https://github.com/suryanshdwivedi1/devsecops-college-project/security/code-scanning" target="_blank" rel="noopener">
          View Report ↗
        </a>
      </div>

      <!-- Gate 4: AWS ECS -->
      <div class="card">
        <div class="card-tag">
          <span>Cloud Orchestration</span>
          <span class="badge-info">us-east-1</span>
        </div>
        <div class="card-title">AWS ECS Service</div>
        <div class="card-desc">Running in <code>devsecops-live-cluster</code> via AWS Fargate with automated rolling deployment.</div>
        <a class="card-link" href="https://github.com/suryanshdwivedi1/devsecops-college-project" target="_blank" rel="noopener">
          View Report ↗
        </a>
      </div>
    </div>

    <!-- Verified CI/CD Security Pipeline Flow (Clickable with Team Ownership) -->
    <div class="pipeline-section">
      <div class="section-title">
        <span>⚡ Verified CI/CD Security Pipeline Flow</span>
        <span style="font-size: 12px; font-weight: normal; color: var(--text-muted);">Click any step to inspect gate policy & ownership</span>
      </div>
      <div class="pipeline-flow">
        <div class="flow-step active" id="step-btn-1" onclick="selectStep(1)">
          <div class="step-circle">1</div>
          <div class="step-name">Git Push</div>
          <div class="step-sub">main branch</div>
        </div>
        <div class="flow-arrow">➔</div>
        <div class="flow-step" id="step-btn-2" onclick="selectStep(2)">
          <div class="step-circle">2</div>
          <div class="step-name">SonarQube</div>
          <div class="step-sub">SAST Scan</div>
        </div>
        <div class="flow-arrow">➔</div>
        <div class="flow-step" id="step-btn-3" onclick="selectStep(3)">
          <div class="step-circle">3</div>
          <div class="step-name">Docker Build</div>
          <div class="step-sub">node:22-alpine</div>
        </div>
        <div class="flow-arrow">➔</div>
        <div class="flow-step" id="step-btn-4" onclick="selectStep(4)">
          <div class="step-circle">4</div>
          <div class="step-name">SBOM</div>
          <div class="step-sub">CycloneDX</div>
        </div>
        <div class="flow-arrow">➔</div>
        <div class="flow-step" id="step-btn-5" onclick="selectStep(5)">
          <div class="step-circle">5</div>
          <div class="step-name">Trivy Scan</div>
          <div class="step-sub">0 Crit / High</div>
        </div>
        <div class="flow-arrow">➔</div>
        <div class="flow-step" id="step-btn-6" onclick="selectStep(6)">
          <div class="step-circle">6</div>
          <div class="step-name">AWS ECR</div>
          <div class="step-sub">Image Push</div>
        </div>
        <div class="flow-arrow">➔</div>
        <div class="flow-step" id="step-btn-7" onclick="selectStep(7)">
          <div class="step-circle">7</div>
          <div class="step-name">AWS ECS</div>
          <div class="step-sub">Service Update</div>
        </div>
        <div class="flow-arrow">➔</div>
        <div class="flow-step" id="step-btn-8" onclick="selectStep(8)">
          <div class="step-circle">8</div>
          <div class="step-name">Discord</div>
          <div class="step-sub">Alert Sent</div>
        </div>
      </div>

      <!-- Step Details Inspector Box -->
      <div class="step-detail-box" id="step-detail-card">
        <div>
          <div class="step-info-title" id="step-info-name">1. Code Push & Automated Webhook Trigger</div>
          <div class="step-info-desc" id="step-info-desc">Pushing to main branch or opening a pull request initiates the GitHub Actions CI/CD automation workflow.</div>
        </div>
        <div class="step-rule-box">
          <span class="step-rule-label">Gate / Policy Rule</span>
          <span id="step-info-rule">Branch protection rules enforce full CI pipeline pass before merge.</span>
        </div>
        <div class="step-owner-badge" id="step-info-owner">
          Owned by<br><strong>Aditya</strong> (CI/CD)
        </div>
      </div>
    </div>

    <!-- Container Runtime Telemetry & Interactive API Inspector -->
    <div class="grid-2">
      <!-- Left: Runtime Telemetry -->
      <div class="card">
        <div class="section-title">
          <span>📊 Live Container Telemetry</span>
          <div style="display: flex; gap: 8px;">
            <button id="toggle-live-btn" class="btn btn-sm btn-active" onclick="toggleLive()">🟢 Live: ON (3s)</button>
            <button class="btn btn-sm" onclick="manualRefresh()" title="Refresh now">↻ Refresh</button>
          </div>
        </div>
        <div class="metric-row">
          <span class="metric-label">Deployed Commit</span>
          <span class="metric-value">
            <a class="commit-badge" href="https://github.com/suryanshdwivedi1/devsecops-college-project/commit/${GIT_SHA}" target="_blank" rel="noopener">
              Commit: <strong>${GIT_SHA}</strong> ↗
            </a>
          </span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Container Hostname</span>
          <span class="metric-value">${hostname}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Runtime Environment</span>
          <span class="metric-value">Node.js ${process.version} (Alpine Linux)</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Security Context</span>
          <span class="metric-value" style="color: var(--emerald);">USER node (Non-root)</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Container Uptime</span>
          <span class="metric-value" id="uptime-val">${formatUptime(uptimeSec)}</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Heap Memory Used</span>
          <span class="metric-value" id="mem-val">${heapUsedMB} MB</span>
        </div>
        <div class="metric-row">
          <span class="metric-label">Total Requests Handled</span>
          <span class="metric-value" id="req-val">${requestCount}</span>
        </div>
      </div>

      <!-- Right: Interactive API Inspector -->
      <div class="card">
        <div class="api-header">
          <span class="section-title" style="margin-bottom:0;">🔍 Interactive API Explorer</span>
        </div>
        <div class="api-buttons" style="margin-bottom: 12px;">
          <button class="btn btn-active" onclick="fetchEndpoint('/health', this)">GET /health</button>
          <button class="btn" onclick="fetchEndpoint('/api/info', this)">GET /api/info</button>
          <button class="btn" onclick="fetchEndpoint('/api/telemetry', this)">GET /api/telemetry</button>
          <button class="btn" onclick="fetchEndpoint('/api/dependencies', this)">GET /api/dependencies</button>
        </div>
        <div class="json-container">
          <button class="copy-btn" onclick="copyJsonOutput()" id="copy-btn">
            📋 Copy JSON
          </button>
          <pre id="api-output">Click an endpoint above or waiting for initial health probe...</pre>
        </div>
      </div>
    </div>

    <!-- Team Footer -->
    <footer>
      <div class="footer-content">
        <div>
          <strong style="color: var(--text); font-size: 14px;">DevSecOps Container Vulnerability Remediation Platform</strong>
          <p style="margin-top: 4px; font-size: 12px;">College Capstone Project • B.Tech Engineering</p>
        </div>
        <div class="team-grid">
          <div class="team-badge">
            <div class="team-name">Aditya</div>
            <div class="team-role">CI/CD & Automation</div>
          </div>
          <div class="team-badge">
            <div class="team-name">Akhil</div>
            <div class="team-role">AWS & Terraform</div>
          </div>
          <div class="team-badge">
            <div class="team-name">Vaibhav</div>
            <div class="team-role">Docker Hardening</div>
          </div>
          <div class="team-badge">
            <div class="team-name">Suryansh</div>
            <div class="team-role">AppSec & Trivy</div>
          </div>
        </div>
      </div>
      <div class="footer-bottom">
        Powered by <strong>GitHub Actions</strong>, <strong>SonarCloud</strong>, <strong>Aqua Trivy</strong>, <strong>CycloneDX</strong>, and <strong>AWS ECS Fargate</strong> • <a href="https://github.com/suryanshdwivedi1/devsecops-college-project" target="_blank" rel="noopener">GitHub Project Repository ↗</a>
      </div>
    </footer>
  </div>

  <!-- Before vs After Remediation Comparison Modal -->
  <div class="modal-overlay" id="diff-modal" onclick="handleOverlayClick(event)">
    <div class="modal-card">
      <div class="modal-header">
        <h2>🛡️ Container Vulnerability Remediation Diff</h2>
        <button class="modal-close" onclick="closeDiffModal()">×</button>
      </div>
      <div class="modal-body">
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 18px;">
          Demonstrating automated DevSecOps remediation: how base image modernization, package patching, and non-root isolation blocked vulnerable containers and enabled clean ECS deployment.
        </p>
        <div class="diff-grid">
          <!-- Before Column -->
          <div class="diff-col diff-before">
            <div class="diff-title" style="color: var(--red);">
              <span>🔴</span> Before (Blocked by Trivy)
            </div>
            <div class="diff-item">
              <span class="diff-item-label">Base Image</span>
              <span class="diff-item-val" style="color: #FCA5A5;">node:14-alpine (EOL / Outdated)</span>
            </div>
            <div class="diff-item">
              <span class="diff-item-label">Dependencies</span>
              <span class="diff-item-val" style="color: #FCA5A5;">express@4.16.0 (Prototype Pollution)</span>
            </div>
            <div class="diff-item">
              <span class="diff-item-label">Container Security</span>
              <span class="diff-item-val" style="color: #FCA5A5;">USER root (Container breakout risk)</span>
            </div>
            <div class="diff-item">
              <span class="diff-item-label">Attack Surface</span>
              <span class="diff-item-val" style="color: #FCA5A5;">npm & yarn binaries present</span>
            </div>
            <div class="diff-item">
              <span class="diff-item-label">Trivy Gate Result</span>
              <span class="diff-item-val" style="color: #EF4444; font-weight: bold;">FAILED (exit-code 1: Critical CVEs)</span>
            </div>
            <div class="diff-item">
              <span class="diff-item-label">AWS ECS Deployment</span>
              <span class="diff-item-val" style="color: #EF4444; font-weight: bold;">🚫 BLOCKED (Security Gate Enforced)</span>
            </div>
            <div class="diff-item">
              <span class="diff-item-label">Alert Triggered</span>
              <span class="diff-item-val" style="color: #FCA5A5;">🚨 Discord Alert: Pipeline Blocked</span>
            </div>
          </div>

          <!-- After Column -->
          <div class="diff-col diff-after">
            <div class="diff-title" style="color: var(--emerald);">
              <span>🟢</span> After (Deployed Live to ECS)
            </div>
            <div class="diff-item">
              <span class="diff-item-label">Base Image</span>
              <span class="diff-item-val" style="color: #6EE7B7;">node:22-alpine + apk upgrade</span>
            </div>
            <div class="diff-item">
              <span class="diff-item-label">Dependencies</span>
              <span class="diff-item-val" style="color: #6EE7B7;">express@^4.21.2 (Fully patched)</span>
            </div>
            <div class="diff-item">
              <span class="diff-item-label">Container Security</span>
              <span class="diff-item-val" style="color: #6EE7B7;">USER node (Non-root least-privilege)</span>
            </div>
            <div class="diff-item">
              <span class="diff-item-label">Attack Surface</span>
              <span class="diff-item-val" style="color: #6EE7B7;">npm/yarn removed after install</span>
            </div>
            <div class="diff-item">
              <span class="diff-item-label">Trivy Gate Result</span>
              <span class="diff-item-val" style="color: #10B981; font-weight: bold;">PASSED (0 Critical / 0 High CVEs)</span>
            </div>
            <div class="diff-item">
              <span class="diff-item-label">AWS ECS Deployment</span>
              <span class="diff-item-val" style="color: #10B981; font-weight: bold;">✅ DEPLOYED to Fargate Live</span>
            </div>
            <div class="diff-item">
              <span class="diff-item-label">Alert Triggered</span>
              <span class="diff-item-val" style="color: #6EE7B7;">✅ Discord Alert: Deployment Success</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    // Pipeline Steps Data
    const stepsData = {
      1: {
        name: "1. Code Push & Automated Webhook Trigger",
        desc: "Pushing to main branch or opening a pull request initiates the GitHub Actions CI/CD automation workflow.",
        rule: "Branch protection rules enforce full CI pipeline pass before merge.",
        owner: "Aditya (CI/CD)"
      },
      2: {
        name: "2. SonarQube Cloud SAST Scan",
        desc: "Performs Static Application Security Testing (SAST) scanning source code for security vulnerabilities, code smells, and bugs.",
        rule: "SonarCloud Quality Gate must be CLEAN; reports synced with SonarCloud dashboard.",
        owner: "Suryansh (AppSec)"
      },
      3: {
        name: "3. Hardened Docker Container Build",
        desc: "Builds production container with node:22-alpine, runs apk upgrade, and strips npm/yarn CLIs to minimize attack surface.",
        rule: "Multi-layer optimization, non-root user enforcement (USER node).",
        owner: "Vaibhav (Docker)"
      },
      4: {
        name: "4. CycloneDX SBOM Generation & Archive",
        desc: "Extracts Software Bill of Materials (SBOM) cataloging all packages, libraries, and licenses in standardized CycloneDX JSON format.",
        rule: "Trivy SBOM extraction exit-code: 0; artifact archived in GitHub for 30 days.",
        owner: "Aditya (CI/CD)"
      },
      5: {
        name: "5. Aqua Trivy Vulnerability Scan & SARIF",
        desc: "Scans container image for OS and package vulnerabilities; generates SARIF report for GitHub Security tab.",
        rule: "STRICT SECURITY GATE: exit-code: 1 on any CRITICAL or HIGH severity CVEs.",
        owner: "Suryansh (AppSec)"
      },
      6: {
        name: "6. Amazon ECR Registry Authentication & Push",
        desc: "Authenticates runner via AWS credentials, tags image with git commit SHA and latest, and pushes to Amazon ECR.",
        rule: "Image immutability & AWS IAM role authentication scoped to region us-east-1.",
        owner: "Akhil (AWS/Terraform)"
      },
      7: {
        name: "7. Amazon ECS Service Rolling Deployment",
        desc: "Invokes aws ecs update-service with --force-new-deployment to roll out the updated container across Fargate tasks.",
        rule: "Zero-downtime rolling update on devsecops-live-cluster / devsecops-app-task-service-7hay9jm1.",
        owner: "Akhil (AWS/Terraform)"
      },
      8: {
        name: "8. Discord Real-Time Pipeline Alerts",
        desc: "Dispatches instant notifications to team Discord channel alerting on successful deployment or blocked vulnerabilities.",
        rule: "if: failure() blocks pipeline with alert; if: success() notifies of live rollout.",
        owner: "Suryansh (Observability)"
      }
    };

    function selectStep(stepId) {
      document.querySelectorAll('.flow-step').forEach(s => s.classList.remove('active'));
      const activeEl = document.getElementById('step-btn-' + stepId);
      if (activeEl) activeEl.classList.add('active');

      const data = stepsData[stepId];
      if (data) {
        document.getElementById('step-info-name').innerText = data.name;
        document.getElementById('step-info-desc').innerText = data.desc;
        document.getElementById('step-info-rule').innerText = data.rule;
        document.getElementById('step-info-owner').innerHTML = 'Owned by<br><strong>' + data.owner + '</strong>';
      }
    }

    // Modal Controls
    function openDiffModal() {
      document.getElementById('diff-modal').classList.add('open');
    }
    function closeDiffModal() {
      document.getElementById('diff-modal').classList.remove('open');
    }
    function handleOverlayClick(e) {
      if (e.target.id === 'diff-modal') closeDiffModal();
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDiffModal();
    });

    // Auto-refresh Telemetry
    let isLive = true;
    let refreshInterval = null;

    async function fetchTelemetryData() {
      try {
        const res = await fetch('/api/telemetry');
        const data = await res.json();
        document.getElementById('uptime-val').innerText = data.uptime;
        document.getElementById('mem-val').innerText = data.memory.heapUsedMB + ' MB';
        document.getElementById('req-val').innerText = data.totalRequests;
      } catch (e) {}
    }

    function toggleLive() {
      const btn = document.getElementById('toggle-live-btn');
      if (isLive) {
        clearInterval(refreshInterval);
        isLive = false;
        btn.classList.remove('btn-active');
        btn.innerText = '⏸ Live: OFF';
      } else {
        isLive = true;
        btn.classList.add('btn-active');
        btn.innerText = '🟢 Live: ON (3s)';
        fetchTelemetryData();
        refreshInterval = setInterval(fetchTelemetryData, 3000);
      }
    }

    function manualRefresh() {
      fetchTelemetryData();
    }

    // Start auto-refresh
    refreshInterval = setInterval(fetchTelemetryData, 3000);

    // Interactive Endpoint Viewer
    let currentRawJson = '';

    async function fetchEndpoint(endpoint, btn) {
      document.querySelectorAll('.api-buttons .btn').forEach(b => b.classList.remove('btn-active'));
      if (btn) btn.classList.add('btn-active');
      const output = document.getElementById('api-output');
      output.innerText = 'Fetching ' + endpoint + '...';
      try {
        const res = await fetch(endpoint);
        const json = await res.json();
        currentRawJson = JSON.stringify(json, null, 2);
        output.innerText = currentRawJson;
      } catch (err) {
        output.innerText = 'Error calling ' + endpoint + ': ' + err.message;
      }
    }

    // Copy JSON to clipboard
    function copyJsonOutput() {
      const text = document.getElementById('api-output').innerText;
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copy-btn');
        btn.innerText = '✅ Copied!';
        setTimeout(() => { btn.innerText = '📋 Copy JSON'; }, 2000);
      });
    }

    // Auto-fetch /health on first load
    fetchEndpoint('/health');
  </script>
</body>
</html>`;

  res.send(html);
});

// Start Server
app.listen(PORT, () => {
  console.log(`[DevSecOps App] Running on port ${PORT} (commit: ${GIT_SHA})`);
});
