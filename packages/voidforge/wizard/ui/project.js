/**
 * Project Dashboard — Client-side tab navigation and data loading.
 * v22.0 ADR-041 M4: Single-page project dashboard with tabs.
 */

(function () {
  'use strict';

  // ── URL params ────────────────────────────────────
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get('id');
  const projectName = params.get('name') || 'Project';

  if (!projectId) {
    window.location.href = '/lobby.html';
    return;
  }

  // Store as last visited project for Lobby "Resume" link
  try {
    localStorage.setItem('voidforge-last-project', JSON.stringify({ id: projectId, name: projectName }));
  } catch { /* localStorage unavailable */ }

  // Set breadcrumb
  document.getElementById('project-name').textContent = projectName;
  document.title = projectName + ' — VoidForge';

  // ── Tab management ────────────────────────────────
  const tabs = document.querySelectorAll('[role="tab"]');
  const panels = document.querySelectorAll('[role="tabpanel"]');
  let towerLoaded = false;

  function activateTab(tab) {
    tabs.forEach(function (t) {
      t.setAttribute('aria-selected', 'false');
      t.setAttribute('tabindex', '-1');
    });
    panels.forEach(function (p) {
      p.classList.remove('active');
    });

    tab.setAttribute('aria-selected', 'true');
    tab.setAttribute('tabindex', '0');
    tab.focus();

    var panelId = tab.getAttribute('aria-controls');
    var panel = document.getElementById(panelId);
    if (panel) panel.classList.add('active');

    // Lazy-load Tower iframe on first activation
    if (panelId === 'panel-tower' && !towerLoaded) {
      loadTower();
      towerLoaded = true;
    }

    // Load data for the active panel
    if (panelId === 'panel-overview') loadOverview();
    else if (panelId === 'panel-danger-room') loadDangerRoom();
    else if (panelId === 'panel-war-room') loadWarRoom();
    else if (panelId === 'panel-deploy') loadDeploy();
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () { activateTab(tab); });
  });

  // Keyboard navigation: ArrowLeft/ArrowRight between tabs
  document.querySelector('[role="tablist"]').addEventListener('keydown', function (e) {
    var tabArray = Array.from(tabs);
    var currentIndex = tabArray.indexOf(document.activeElement);
    if (currentIndex === -1) return;

    var newIndex = -1;
    if (e.key === 'ArrowRight') {
      newIndex = (currentIndex + 1) % tabArray.length;
    } else if (e.key === 'ArrowLeft') {
      newIndex = (currentIndex - 1 + tabArray.length) % tabArray.length;
    } else if (e.key === 'Home') {
      newIndex = 0;
    } else if (e.key === 'End') {
      newIndex = tabArray.length - 1;
    }

    if (newIndex >= 0) {
      e.preventDefault();
      activateTab(tabArray[newIndex]);
    }
  });

  // ── API helpers ───────────────────────────────────

  function apiUrl(endpoint) {
    return '/api/projects/' + encodeURIComponent(projectId) + '/danger-room/' + endpoint;
  }

  function warApiUrl(endpoint) {
    return '/api/projects/' + encodeURIComponent(projectId) + '/war-room/' + endpoint;
  }

  async function fetchJson(url) {
    try {
      var res = await fetch(url);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  // ── Overview panel ────────────────────────────────

  async function loadOverview() {
    // Fetch all overview data in parallel
    var [version, git, campaign, tests, deploy, findings] = await Promise.all([
      fetchJson(apiUrl('version')),
      fetchJson(apiUrl('git-status')),
      fetchJson(apiUrl('campaign')),
      fetchJson(apiUrl('tests')),
      fetchJson(apiUrl('deploy')),
      fetchJson(apiUrl('findings')),
    ]);

    // v22.2 M1: Detect empty project — show onboarding if no meaningful data
    var isEmpty = !campaign && !deploy && (!tests || tests.total === 0)
      && (!findings || (findings.critical + findings.high + findings.medium + findings.low === 0));

    var onboarding = document.getElementById('overview-onboarding');
    var grid = document.getElementById('overview-grid');
    if (onboarding) {
      onboarding.style.display = isEmpty ? '' : 'none';
      grid.style.display = isEmpty ? 'none' : '';
    }

    // Version
    if (version) {
      document.getElementById('overview-version').textContent = version.version || '—';
      document.getElementById('overview-branch').textContent = version.branch || '—';
    }

    // Git
    if (git) {
      document.getElementById('overview-git-branch').textContent = git.branch || '—';
      var parts = [];
      if (git.uncommitted > 0) parts.push(git.uncommitted + ' uncommitted');
      if (git.ahead > 0) parts.push(git.ahead + ' ahead');
      if (git.behind > 0) parts.push(git.behind + ' behind');
      document.getElementById('overview-git-detail').textContent = parts.length > 0 ? parts.join(', ') : git.lastCommit || 'Clean';
    }

    // Campaign
    if (campaign) {
      var complete = campaign.missions.filter(function (m) { return m.status === 'COMPLETE'; }).length;
      document.getElementById('overview-campaign').textContent = complete + '/' + campaign.missions.length;
      document.getElementById('overview-campaign-detail').textContent = 'Status: ' + campaign.status;
    }

    // Tests
    if (tests) {
      document.getElementById('overview-tests').textContent = tests.passed + '/' + tests.total;
      document.getElementById('overview-tests-detail').textContent = tests.failed > 0 ? tests.failed + ' failed' : 'All passing';
    }

    // Deploy
    if (deploy) {
      document.getElementById('overview-deploy').textContent = deploy.healthy ? 'Healthy' : 'Down';
      document.getElementById('overview-deploy-detail').textContent = deploy.url || deploy.target || '—';
    }

    // Findings
    if (findings) {
      var total = findings.critical + findings.high + findings.medium + findings.low;
      document.getElementById('overview-findings').textContent = total > 0 ? String(total) : 'None';
      if (findings.critical > 0) {
        document.getElementById('overview-findings-detail').textContent = findings.critical + ' critical, ' + findings.high + ' high';
      } else if (findings.high > 0) {
        document.getElementById('overview-findings-detail').textContent = findings.high + ' high, ' + findings.medium + ' medium';
      } else {
        document.getElementById('overview-findings-detail').textContent = 'Clean';
      }
    }
  }

  // ── Tower panel ───────────────────────────────────

  function loadTower() {
    var container = document.getElementById('tower-container');
    var towerParams = new URLSearchParams({
      project: projectId,
      name: projectName,
      dir: params.get('dir') || '',
      embed: '1',
    });
    var iframe = document.createElement('iframe');
    iframe.src = '/tower.html?' + towerParams.toString();
    iframe.title = 'Terminal — ' + projectName;
    container.appendChild(iframe);
  }

  // ── Danger Room panel ─────────────────────────────

  async function loadDangerRoom() {
    var [heartbeat, campaign] = await Promise.all([
      fetchJson(apiUrl('heartbeat')),
      fetchJson(apiUrl('campaign')),
    ]);

    var container = document.getElementById('danger-room-content');
    var empty = document.getElementById('dr-empty');

    if (!heartbeat && !campaign) {
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';

    // Build simple status cards
    var html = '<div class="panel-grid">';

    if (heartbeat) {
      html += '<div class="panel-card"><h3>Cultivation</h3>';
      html += '<div class="value">' + (heartbeat.cultivationInstalled ? 'Installed' : 'Not installed') + '</div>';
      if (heartbeat.treasury) {
        var t = heartbeat.treasury;
        html += '<div class="detail">Spend: $' + (t.spend / 100).toFixed(2) + ' | Revenue: $' + (t.revenue / 100).toFixed(2) + '</div>';
        if (t.roas > 0) html += '<div class="detail">ROAS: ' + t.roas.toFixed(1) + 'x</div>';
      }
      html += '</div>';

      if (heartbeat.campaigns && heartbeat.campaigns.length > 0) {
        html += '<div class="panel-card"><h3>Campaigns</h3>';
        html += '<div class="value">' + heartbeat.campaigns.length + '</div>';
        html += '<div class="detail">Active ad campaigns</div></div>';
      }
    }

    if (campaign) {
      html += '<div class="panel-card"><h3>Build Campaign</h3>';
      var complete = campaign.missions.filter(function (m) { return m.status === 'COMPLETE'; }).length;
      html += '<div class="value">' + complete + '/' + campaign.missions.length + ' missions</div>';
      html += '<div class="detail">Status: ' + campaign.status + '</div></div>';
    }

    html += '</div>';
    container.innerHTML = html;
  }

  // ── War Room panel ────────────────────────────────

  async function loadWarRoom() {
    var [campaign, current] = await Promise.all([
      fetchJson(warApiUrl('campaign')),
      fetchJson(apiUrl('current')),
    ]);

    var container = document.getElementById('war-room-content');
    var empty = document.getElementById('wr-empty');

    if (!campaign && (!current || !current.initialized)) {
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';

    var html = '<div class="panel-grid">';

    if (campaign) {
      html += '<div class="panel-card"><h3>Campaign Progress</h3>';
      campaign.missions.forEach(function (m) {
        var icon = m.status === 'COMPLETE' ? '&#10003;' : m.status === 'ACTIVE' ? '&#9654;' : '&#9675;';
        html += '<div class="detail">' + icon + ' M' + m.number + ': ' + m.name + ' — ' + m.status + '</div>';
      });
      html += '</div>';
    }

    if (current && current.initialized) {
      html += '<div class="panel-card"><h3>Deep Current</h3>';
      html += '<div class="value">Active</div>';
      html += '<div class="detail">Intelligence gathering enabled</div></div>';
    }

    html += '</div>';
    container.innerHTML = html;
  }

  // ── Deploy panel ──────────────────────────────────

  async function loadDeploy() {
    var [deploy, drift] = await Promise.all([
      fetchJson(apiUrl('deploy')),
      fetchJson(apiUrl('drift')),
    ]);

    var container = document.getElementById('deploy-content');
    var empty = document.getElementById('deploy-empty');

    if (!deploy) {
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';

    var html = '<div class="panel-grid">';
    html += '<div class="panel-card"><h3>Deploy Status</h3>';
    html += '<div class="value">' + (deploy.healthy ? 'Healthy' : 'Down') + '</div>';
    if (deploy.url) html += '<div class="detail"><a href="' + deploy.url + '" target="_blank" rel="noopener">' + deploy.url + '</a></div>';
    if (deploy.target) html += '<div class="detail">Target: ' + deploy.target + '</div>';
    if (deploy.timestamp) html += '<div class="detail">Last deploy: ' + deploy.timestamp + '</div>';
    html += '</div>';

    if (drift) {
      html += '<div class="panel-card"><h3>Drift Detection</h3>';
      html += '<div class="value">' + (drift.drifted ? 'Drifted' : 'In sync') + '</div>';
      if (drift.deployed_commit) html += '<div class="detail">Deployed: ' + drift.deployed_commit + '</div>';
      if (drift.head_commit) html += '<div class="detail">HEAD: ' + drift.head_commit + '</div>';
      html += '</div>';
    }

    html += '</div>';
    container.innerHTML = html;
  }

  // ── Init ──────────────────────────────────────────
  loadOverview();
})();
