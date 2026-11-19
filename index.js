const express = require('express');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const START_TIME = Date.now();
let requestCount = 0;

// Middleware to track requests
app.use((req, res, next) => {
  requestCount++;
  next();
});

// Helper for formatting uptime
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

// Health check endpoint (for ECS / ALB target group health checks)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
    checks: {
      container: 'healthy',
      runtime: 'node22-alpine',
      securityGate: 'passed'
    }
  });
});

// Deployment & pipeline info endpoint
app.get('/api/info', (req, res) => {
  res.json({
    project: 'DevSecOps Automated Pipeline Demo',
    environment: 'production',
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

// Live runtime telemetry endpoint
app.get('/api/telemetry', (req, res) => {
  const mem = process.memoryUsage();
  const uptimeSec = Math.floor((Date.now() - START_TIME) / 1000);

  res.json({
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

// -------------------------------------------------------------
// UI Dashboard (HTML / CSS / JS)
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
  <title>DevSecOps Security & Pipeline Telemetry</title>
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
      max-width: 1200px;
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
      margin-bottom: 28px;
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
    .live-status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--emerald-glow);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: var(--emerald);
      padding: 6px 14px;
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
    /* Grid */
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
      overflow: hidden;
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
      gap: 8px;
    }
    .pipeline-flow {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      overflow-x: auto;
      padding: 10px 0;
    }
    .flow-step {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      min-width: 110px;
    }
    .step-circle {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #1F2937;
      border: 2px solid var(--emerald);
      color: var(--emerald);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      margin-bottom: 8px;
    }
    .step-name {
      font-size: 12px;
      font-weight: 600;
      color: var(--text);
    }
    .step-sub {
      font-size: 11px;
      color: var(--emerald);
    }
    .flow-arrow {
      color: #4B5563;
      font-size: 16px;
      flex-shrink: 0;
    }
    /* Telemetry & API Tester */
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 20px;
      margin-bottom: 28px;
    }
    .metric-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #1F2937;
      font-size: 13px;
    }
    .metric-row:last-child { border-bottom: none; }
    .metric-label { color: var(--text-muted); }
    .metric-value { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 600; }
    
    /* Interactive API Tester */
    .api-buttons {
      display: flex;
      gap: 10px;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }
    .btn {
      background: #1F2937;
      color: var(--text);
      border: 1px solid #374151;
      padding: 7px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s;
    }
    .btn:hover { background: #374151; }
    .btn-active {
      background: var(--blue);
      border-color: var(--blue);
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
      max-height: 220px;
    }
    footer {
      text-align: center;
      padding-top: 20px;
      border-top: 1px solid var(--card-border);
      color: var(--text-muted);
      font-size: 13px;
    }
    footer a { color: var(--cyan); text-decoration: none; }
    footer a:hover { text-decoration: underline; }
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
          <p>College Project • Automated Container Hardening & ECS Deployment</p>
        </div>
      </div>
      <div class="live-status">
        <span class="pulse-dot"></span>
        AWS ECS Fargate Live
      </div>
    </header>

    <!-- Top Security & Pipeline Gates -->
    <div class="grid-4">
      <!-- Gate 1: SonarQube -->
      <div class="card">
        <div class="card-tag">
          <span>SAST & Code Quality</span>
          <span class="badge-success">Passed</span>
        </div>
        <div class="card-title">SonarQube Cloud</div>
        <div class="card-desc">Static Application Security Testing passed with clean Quality Gate. Zero security hotspots.</div>
      </div>

      <!-- Gate 2: SBOM -->
      <div class="card">
        <div class="card-tag">
          <span>Software Supply Chain</span>
          <span class="badge-info">CycloneDX</span>
        </div>
        <div class="card-title">SBOM Generated</div>
        <div class="card-desc">Machine-readable inventory of container dependencies archived for 30 days in GitHub Artifacts.</div>
      </div>

      <!-- Gate 3: Trivy Scanner -->
      <div class="card">
        <div class="card-tag">
          <span>Vulnerability Gate</span>
          <span class="badge-success">0 CVEs</span>
        </div>
        <div class="card-title">Aqua Trivy Scan</div>
        <div class="card-desc">Hardened Alpine base image. Zero Critical or High severity CVEs detected. SARIF uploaded to Security tab.</div>
      </div>

      <!-- Gate 4: AWS ECS -->
      <div class="card">
        <div class="card-tag">
          <span>Cloud Orchestration</span>
          <span class="badge-info">us-east-1</span>
        </div>
        <div class="card-title">AWS ECS Service</div>
        <div class="card-desc">Running in <code>devsecops-live-cluster</code> via AWS Fargate with automated rolling deployment.</div>
      </div>
    </div>

    <!-- Pipeline Architecture Stages -->
    <div class="pipeline-section">
      <div class="section-title">
        <span>⚡ Verified CI/CD Security Pipeline Flow</span>
      </div>
      <div class="pipeline-flow">
        <div class="flow-step">
          <div class="step-circle">✓</div>
          <div class="step-name">1. Git Push</div>
          <div class="step-sub">main branch</div>
        </div>
        <div class="flow-arrow">➔</div>
        <div class="flow-step">
          <div class="step-circle">✓</div>
          <div class="step-name">2. SonarQube</div>
          <div class="step-sub">SAST Scan</div>
        </div>
        <div class="flow-arrow">➔</div>
        <div class="flow-step">
          <div class="step-circle">✓</div>
          <div class="step-name">3. Docker Build</div>
          <div class="step-sub">node:22-alpine</div>
        </div>
        <div class="flow-arrow">➔</div>
        <div class="flow-step">
          <div class="step-circle">✓</div>
          <div class="step-name">4. SBOM</div>
          <div class="step-sub">CycloneDX</div>
        </div>
        <div class="flow-arrow">➔</div>
        <div class="flow-step">
          <div class="step-circle">✓</div>
          <div class="step-name">5. Trivy Scan</div>
          <div class="step-sub">0 Crit / High</div>
        </div>
        <div class="flow-arrow">➔</div>
        <div class="flow-step">
          <div class="step-circle">✓</div>
          <div class="step-name">6. AWS ECR</div>
          <div class="step-sub">Image Push</div>
        </div>
        <div class="flow-arrow">➔</div>
        <div class="flow-step">
          <div class="step-circle">✓</div>
          <div class="step-name">7. AWS ECS</div>
          <div class="step-sub">Service Update</div>
        </div>
        <div class="flow-arrow">➔</div>
        <div class="flow-step">
          <div class="step-circle">✓</div>
          <div class="step-name">8. Discord</div>
          <div class="step-sub">Alert Sent</div>
        </div>
      </div>
    </div>

    <!-- Container Runtime Telemetry & Interactive API Inspector -->
    <div class="grid-2">
      <!-- Left: Runtime Telemetry -->
      <div class="card">
        <div class="section-title">📊 Live Container Runtime Telemetry</div>
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
        <div class="section-title">🔍 Interactive API Explorer</div>
        <div class="api-buttons">
          <button class="btn btn-active" onclick="fetchEndpoint('/health', this)">GET /health</button>
          <button class="btn" onclick="fetchEndpoint('/api/info', this)">GET /api/info</button>
          <button class="btn" onclick="fetchEndpoint('/api/telemetry', this)">GET /api/telemetry</button>
        </div>
        <pre id="api-output">Click a button above or waiting for initial health probe...</pre>
      </div>
    </div>

    <!-- Footer -->
    <footer>
      <p>DevSecOps College Capstone Project • Powered by <strong>GitHub Actions</strong>, <strong>Trivy</strong>, <strong>SonarCloud</strong>, and <strong>AWS ECS Fargate</strong></p>
      <p style="margin-top: 6px;"><a href="https://github.com/suryanshdwivedi1/devsecops-college-project" target="_blank">View GitHub Repository ↗</a></p>
    </footer>
  </div>

  <script>
    // Live update telemetry every 3 seconds
    async function updateTelemetry() {
      try {
        const res = await fetch('/api/telemetry');
        const data = await res.json();
        document.getElementById('uptime-val').innerText = data.uptime;
        document.getElementById('mem-val').innerText = data.memory.heapUsedMB + ' MB';
        document.getElementById('req-val').innerText = data.totalRequests;
      } catch (e) {}
    }
    setInterval(updateTelemetry, 3000);

    // Interactive endpoint viewer
    async function fetchEndpoint(endpoint, btn) {
      document.querySelectorAll('.api-buttons .btn').forEach(b => b.classList.remove('btn-active'));
      if (btn) btn.classList.add('btn-active');
      const output = document.getElementById('api-output');
      output.innerText = 'Loading ' + endpoint + '...';
      try {
        const res = await fetch(endpoint);
        const json = await res.json();
        output.innerText = JSON.stringify(json, null, 2);
      } catch (err) {
        output.innerText = 'Error calling ' + endpoint + ': ' + err.message;
      }
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
  console.log(`[DevSecOps App] Running on port ${PORT}`);
});
