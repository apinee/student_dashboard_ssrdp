/**
 * SRDP Dynamic Student Dashboard - Engine
 * Handles State, Chart.js Visualizations, Tile Drill-Down Modals,
 * and Live Google Sheets Synchronization.
 */

// State normalization map for raw spreadsheet typos
const STATE_CANONICAL_MAP = {
  'karanataka': 'Karnataka',
  'karnataka': 'Karnataka',
  'maharastra': 'Maharashtra',
  'maharashtra': 'Maharashtra',
  'tamil nadu': 'Tamil Nadu',
  'uttrakhand': 'Uttarakhand',
  'uttarakhand': 'Uttarakhand',
  'jammu & kashmir': 'Jammu & Kashmir',
  'jammu and kashmir': 'Jammu & Kashmir'
};

function normalizeStateName(stateStr) {
  if (!stateStr) return 'Unknown';
  const clean = String(stateStr).trim();
  const lower = clean.toLowerCase();
  return STATE_CANONICAL_MAP[lower] || clean;
}

// App State
const state = {
  dataSourceType: 'local', // 'local' or 'googlesheets'
  rawSummary: [],
  rawStudents: [],
  filters: {
    program: 'ALL',
    state: 'ALL',
    year: 'ALL'
  },
  charts: {
    programs: null,
    share: null,
    states: null,
    trend: null,
    modal: null
  }
};

// Color palettes for sleek data visualization
const CHART_COLORS = [
  '#06b6d4', '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b',
  '#ec4899', '#f43f5e', '#14b8a6', '#6366f1', '#eab308', '#a855f7'
];

// Document Ready
document.addEventListener('DOMContentLoaded', () => {
  initDashboard();
});

function initDashboard() {
  // Load default dataset from data.js
  if (typeof INITIAL_DASHBOARD_DATA !== 'undefined') {
    state.rawSummary = INITIAL_DASHBOARD_DATA.summary || [];
    state.rawStudents = INITIAL_DASHBOARD_DATA.students || [];
  }

  // Populate Dropdown Filters
  populateFilterOptions();

  // Setup Event Listeners
  setupEventListeners();

  // Check saved Google Sheet URL in localStorage
  const savedSheetUrl = localStorage.getItem('srdp_google_sheet_url');
  if (savedSheetUrl) {
    document.getElementById('sheetsUrlInput').value = savedSheetUrl;
    fetchGoogleSheetData(savedSheetUrl, false);
  } else {
    renderDashboard();
  }
}

/**
 * Populate dynamic options in Program and State filter dropdowns
 */
function populateFilterOptions() {
  const programSelect = document.getElementById('filterProgram');
  const stateSelect = document.getElementById('filterState');

  const programs = Array.from(new Set(state.rawSummary.map(d => d.training))).sort();
  const states = Array.from(new Set(state.rawSummary.map(d => normalizeStateName(d.state)))).sort();

  // Clear existing options (keep ALL)
  programSelect.innerHTML = '<option value="ALL">All Programs</option>';
  stateSelect.innerHTML = '<option value="ALL">All States</option>';

  programs.forEach(prog => {
    const opt = document.createElement('option');
    opt.value = prog;
    opt.textContent = prog;
    programSelect.appendChild(opt);
  });

  states.forEach(st => {
    const opt = document.createElement('option');
    opt.value = st;
    opt.textContent = st;
    stateSelect.appendChild(opt);
  });
}

/**
 * Filter data based on active user selections
 */
function getFilteredSummary() {
  return state.rawSummary.filter(item => {
    const matchProg = state.filters.program === 'ALL' || item.training === state.filters.program;
    const matchState = state.filters.state === 'ALL' || normalizeStateName(item.state) === state.filters.state;
    return matchProg && matchState;
  });
}

/**
 * Get student count for an item based on active year selection
 */
function getItemCount(item, yearFilter) {
  if (yearFilter === '2021') return Number(item.y2021) || 0;
  if (yearFilter === '2022') return Number(item.y2022) || 0;
  if (yearFilter === '2023') return Number(item.y2023) || 0;
  if (yearFilter === '2024') return Number(item.y2024) || 0;
  return Number(item.total) || 0;
}

/**
 * Main render function
 */
function renderDashboard() {
  const filtered = getFilteredSummary();
  const yearFilter = state.filters.year;

  // 1. Calculate Core KPIs
  let totalStudents = 0;
  const programMap = {};
  const stateMap = {};
  let year2024Total = 0;

  filtered.forEach(item => {
    const count = getItemCount(item, yearFilter);
    totalStudents += count;

    // By Program
    programMap[item.training] = (programMap[item.training] || 0) + count;

    // By State
    const st = normalizeStateName(item.state);
    stateMap[st] = (stateMap[st] || 0) + count;

    // 2024 cohort
    year2024Total += Number(item.y2024) || 0;
  });

  // Top Program
  let topProgram = { name: 'None', count: 0 };
  Object.entries(programMap).forEach(([pName, pCount]) => {
    if (pCount > topProgram.count) topProgram = { name: pName, count: pCount };
  });

  // Top State
  let topState = { name: 'None', count: 0 };
  Object.entries(stateMap).forEach(([sName, sCount]) => {
    if (sCount > topState.count) topState = { name: sName, count: sCount };
  });

  const activeProgramsCount = Object.keys(programMap).filter(k => programMap[k] > 0).length;
  const activeStatesCount = Object.keys(stateMap).filter(k => stateMap[k] > 0).length;

  // 2. Update KPI Tiles
  document.getElementById('valTotalStudents').textContent = totalStudents.toLocaleString();
  document.getElementById('valTotalPrograms').textContent = activeProgramsCount;
  document.getElementById('valTotalStates').textContent = activeStatesCount;
  document.getElementById('valTopProgram').textContent = topProgram.name;
  document.getElementById('subTopProgram').innerHTML = `<span class="clickable-hint">Click tile:</span> ${topProgram.count} students enrolled`;
  document.getElementById('valTopState').textContent = topState.name;
  document.getElementById('subTopState').innerHTML = `<span class="clickable-hint">Click tile:</span> ${topState.count} students trained`;
  document.getElementById('valRecentCohort').textContent = year2024Total.toLocaleString();

  // Active filter badge
  const isFiltered = state.filters.program !== 'ALL' || state.filters.state !== 'ALL' || state.filters.year !== 'ALL';
  const filterBadge = document.getElementById('activeFilterBadge');
  if (isFiltered) {
    filterBadge.style.display = 'inline-block';
    filterBadge.textContent = `Filtered: ${state.filters.program !== 'ALL' ? state.filters.program : ''} ${state.filters.state !== 'ALL' ? '| ' + state.filters.state : ''} ${state.filters.year !== 'ALL' ? '| Year ' + state.filters.year : ''}`;
  } else {
    filterBadge.style.display = 'none';
  }

  // 3. Render / Update Charts
  renderProgramBarChart(programMap);
  renderShareDoughnutChart(programMap);
  renderStatesBarChart(stateMap);
  renderTrendLineChart(filtered);

  // 4. Render Student Directory
  renderStudentRoster();
}

/**
 * Chart 1: Enrollment by Training Program (Bar)
 */
function renderProgramBarChart(programMap) {
  const ctx = document.getElementById('chartPrograms').getContext('2d');
  const sorted = Object.entries(programMap)
    .filter(([_, cnt]) => cnt > 0)
    .sort((a, b) => b[1] - a[1]);

  const labels = sorted.map(d => d[0]);
  const data = sorted.map(d => d[1]);

  if (state.charts.programs) {
    state.charts.programs.destroy();
  }

  state.charts.programs = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Enrolled Students',
        data: data,
        backgroundColor: 'rgba(56, 189, 248, 0.75)',
        borderColor: '#38bdf8',
        borderWidth: 1.5,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          titleColor: '#f8fafc',
          bodyColor: '#94a3b8',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 10
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#94a3b8',
            font: { size: 11 },
            maxRotation: 45,
            minRotation: 20
          }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8' }
        }
      },
      onClick: (evt, elements) => {
        if (elements && elements.length > 0) {
          const index = elements[0].index;
          const clickedProgram = labels[index];
          document.getElementById('filterProgram').value = clickedProgram;
          state.filters.program = clickedProgram;
          renderDashboard();
        }
      }
    }
  });
}

/**
 * Chart 2: Program Share Distribution (Doughnut)
 */
function renderShareDoughnutChart(programMap) {
  const ctx = document.getElementById('chartShare').getContext('2d');
  const sorted = Object.entries(programMap)
    .filter(([_, cnt]) => cnt > 0)
    .sort((a, b) => b[1] - a[1]);

  const labels = sorted.map(d => d[0]);
  const data = sorted.map(d => d[1]);

  if (state.charts.share) {
    state.charts.share.destroy();
  }

  state.charts.share = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: CHART_COLORS.slice(0, labels.length),
        borderWidth: 2,
        borderColor: '#1e293b'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#cbd5e1',
            font: { size: 10 },
            boxWidth: 12
          }
        },
        tooltip: {
          backgroundColor: '#1e293b',
          titleColor: '#f8fafc',
          bodyColor: '#94a3b8',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1
        }
      },
      cutout: '65%'
    }
  });
}

/**
 * Chart 3: Top States Distribution (Horizontal Bar)
 */
function renderStatesBarChart(stateMap) {
  const ctx = document.getElementById('chartStates').getContext('2d');
  const sorted = Object.entries(stateMap)
    .filter(([_, cnt]) => cnt > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10); // top 10

  const labels = sorted.map(d => d[0]);
  const data = sorted.map(d => d[1]);

  if (state.charts.states) {
    state.charts.states.destroy();
  }

  state.charts.states = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Students Trained',
        data: data,
        backgroundColor: 'rgba(139, 92, 246, 0.75)',
        borderColor: '#8b5cf6',
        borderWidth: 1.5,
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8' }
        },
        y: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { size: 11 } }
        }
      },
      onClick: (evt, elements) => {
        if (elements && elements.length > 0) {
          const index = elements[0].index;
          const clickedState = labels[index];
          document.getElementById('filterState').value = clickedState;
          state.filters.state = clickedState;
          renderDashboard();
        }
      }
    }
  });
}

/**
 * Chart 4: Year-over-Year Cohort Trend (Line)
 */
function renderTrendLineChart(filtered) {
  const ctx = document.getElementById('chartTrend').getContext('2d');
  const years = ['2021', '2022', '2023', '2024'];
  const totals = [0, 0, 0, 0];

  filtered.forEach(item => {
    totals[0] += Number(item.y2021) || 0;
    totals[1] += Number(item.y2022) || 0;
    totals[2] += Number(item.y2023) || 0;
    totals[3] += Number(item.y2024) || 0;
  });

  if (state.charts.trend) {
    state.charts.trend.destroy();
  }

  state.charts.trend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: years,
      datasets: [{
        label: 'Annual Student Enrolment',
        data: totals,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        fill: true,
        tension: 0.35,
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#ffffff',
        pointRadius: 5,
        pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8' }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8' }
        }
      }
    }
  });
}

/**
 * Render Student Directory Table (Sheet2 records)
 */
function renderStudentRoster() {
  const tbody = document.getElementById('studentRosterBody');
  const searchTerm = (document.getElementById('tableSearchInput')?.value || '').toLowerCase().trim();

  tbody.innerHTML = '';

  const filteredStudents = state.rawStudents.filter(s => {
    const matchProg = state.filters.program === 'ALL' || s.training.includes(state.filters.program) || state.filters.program.includes(s.training);
    const matchState = state.filters.state === 'ALL' || normalizeStateName(s.state) === state.filters.state;
    const matchSearch = !searchTerm ||
      (s.name && s.name.toLowerCase().includes(searchTerm)) ||
      (s.state && s.state.toLowerCase().includes(searchTerm)) ||
      (s.training && s.training.toLowerCase().includes(searchTerm));

    return matchProg && matchState && matchSearch;
  });

  if (filteredStudents.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="4" style="text-align: center; color: var(--text-muted); padding: 2rem;">No student records match the active criteria.</td>`;
    tbody.appendChild(tr);
    return;
  }

  filteredStudents.slice(0, 50).forEach(student => {
    const tr = document.createElement('tr');

    const tdSno = document.createElement('td');
    tdSno.textContent = student.sno || '-';

    const tdName = document.createElement('td');
    tdName.style.fontWeight = '600';
    tdName.textContent = student.name;

    const tdState = document.createElement('td');
    const badgeState = document.createElement('span');
    badgeState.className = 'badge badge-state';
    badgeState.textContent = normalizeStateName(student.state);
    tdState.appendChild(badgeState);

    const tdProg = document.createElement('td');
    const badgeProg = document.createElement('span');
    badgeProg.className = 'badge badge-program';
    badgeProg.textContent = student.training;
    tdProg.appendChild(badgeProg);

    tr.appendChild(tdSno);
    tr.appendChild(tdName);
    tr.appendChild(tdState);
    tr.appendChild(tdProg);

    tbody.appendChild(tr);
  });
}

/**
 * ========================================================
 * DYNAMIC TILE DRILL-DOWN MODAL LOGIC
 * When any tile is clicked, opens rich details showing
 * which program, which states, and how many students!
 * ========================================================
 */
function openTileDrillDown(tileType) {
  const modal = document.getElementById('drilldownModal');
  const titleEl = document.getElementById('modalTitle');
  const statsContainer = document.getElementById('modalStatPills');
  const tableBody = document.getElementById('modalTableBody');
  const yearFilter = state.filters.year;

  const filtered = getFilteredSummary();

  let title = 'Drill-Down Analysis';
  let drillRows = []; // { program, state, count }
  let chartType = 'bar';
  let chartLabels = [];
  let chartData = [];

  switch (tileType) {
    case 'totalStudents': {
      title = 'Total Enrollment Breakdown: Programs & States';
      filtered.forEach(item => {
        const count = getItemCount(item, yearFilter);
        if (count > 0) {
          drillRows.push({
            program: item.training,
            state: normalizeStateName(item.state),
            count: count
          });
        }
      });
      break;
    }
    case 'totalPrograms': {
      title = 'All Active Training Programs: State Distribution';
      // Group by program
      const pMap = {};
      filtered.forEach(item => {
        const count = getItemCount(item, yearFilter);
        if (count > 0) {
          if (!pMap[item.training]) pMap[item.training] = { count: 0, states: new Set() };
          pMap[item.training].count += count;
          pMap[item.training].states.add(normalizeStateName(item.state));
        }
      });
      Object.entries(pMap).forEach(([prog, data]) => {
        drillRows.push({
          program: prog,
          state: `${data.states.size} States (${Array.from(data.states).slice(0, 3).join(', ')}${data.states.size > 3 ? '...' : ''})`,
          count: data.count
        });
      });
      chartType = 'doughnut';
      break;
    }
    case 'totalStates': {
      title = 'Geographic Coverage: Student Counts per State';
      const sMap = {};
      filtered.forEach(item => {
        const count = getItemCount(item, yearFilter);
        if (count > 0) {
          const st = normalizeStateName(item.state);
          if (!sMap[st]) sMap[st] = { count: 0, programs: new Set() };
          sMap[st].count += count;
          sMap[st].programs.add(item.training);
        }
      });
      Object.entries(sMap).forEach(([st, data]) => {
        drillRows.push({
          program: `${data.programs.size} Active Programs`,
          state: st,
          count: data.count
        });
      });
      break;
    }
    case 'topProgram': {
      // Find top program first
      const pCountMap = {};
      filtered.forEach(item => {
        const c = getItemCount(item, yearFilter);
        pCountMap[item.training] = (pCountMap[item.training] || 0) + c;
      });
      let topP = 'None';
      let maxC = 0;
      Object.entries(pCountMap).forEach(([p, c]) => {
        if (c > maxC) { maxC = c; topP = p; }
      });

      title = `Top Program Spotlight: "${topP}" Across States`;
      filtered.filter(i => i.training === topP).forEach(item => {
        const c = getItemCount(item, yearFilter);
        if (c > 0) {
          drillRows.push({
            program: topP,
            state: normalizeStateName(item.state),
            count: c
          });
        }
      });
      break;
    }
    case 'topState': {
      const sCountMap = {};
      filtered.forEach(item => {
        const c = getItemCount(item, yearFilter);
        const st = normalizeStateName(item.state);
        sCountMap[st] = (sCountMap[st] || 0) + c;
      });
      let topS = 'None';
      let maxC = 0;
      Object.entries(sCountMap).forEach(([s, c]) => {
        if (c > maxC) { maxC = c; topS = s; }
      });

      title = `Top State Spotlight: "${topS}" Program Breakdown`;
      filtered.filter(i => normalizeStateName(i.state) === topS).forEach(item => {
        const c = getItemCount(item, yearFilter);
        if (c > 0) {
          drillRows.push({
            program: item.training,
            state: topS,
            count: c
          });
        }
      });
      break;
    }
    case 'cohortGrowth': {
      title = '2024 Batch Details: Programs & States';
      filtered.forEach(item => {
        const count = Number(item.y2024) || 0;
        if (count > 0) {
          drillRows.push({
            program: item.training,
            state: normalizeStateName(item.state),
            count: count
          });
        }
      });
      break;
    }
  }

  // Sort drillRows descending by count
  drillRows.sort((a, b) => b.count - a.count);

  const totalSelectionStudents = drillRows.reduce((acc, r) => acc + r.count, 0);

  // Set Modal Title
  titleEl.textContent = title;

  // Render Stat Pills
  statsContainer.innerHTML = `
    <div class="stat-pill">
      <span class="label">Total Students in View</span>
      <span class="val">${totalSelectionStudents.toLocaleString()}</span>
    </div>
    <div class="stat-pill">
      <span class="label">Distinct Combinations</span>
      <span class="val">${drillRows.length}</span>
    </div>
    <div class="stat-pill">
      <span class="label">Active Year Filter</span>
      <span class="val" style="color: var(--accent-emerald);">${yearFilter === 'ALL' ? 'All Cohorts (2021-2024)' : yearFilter}</span>
    </div>
  `;

  // Render Table
  tableBody.innerHTML = '';
  if (drillRows.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No data for the selected filter.</td></tr>`;
  } else {
    drillRows.forEach(row => {
      const pct = totalSelectionStudents > 0 ? ((row.count / totalSelectionStudents) * 100).toFixed(1) : 0;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 600; color: #fff;">${escapeHtml(row.program)}</td>
        <td><span class="badge badge-state">${escapeHtml(row.state)}</span></td>
        <td style="text-align: right; font-weight: 700; color: var(--accent-cyan);">${row.count}</td>
        <td style="text-align: right; color: var(--text-secondary);">${pct}%</td>
      `;
      tableBody.appendChild(tr);
    });
  }

  // Render Modal Sub-Chart
  renderModalSubChart(drillRows.slice(0, 8), chartType);

  // Show Modal
  modal.classList.add('active');
}

function renderModalSubChart(topRows, chartType) {
  const ctx = document.getElementById('modalSubChart').getContext('2d');
  if (state.charts.modal) {
    state.charts.modal.destroy();
  }

  const labels = topRows.map(r => r.program.length > 18 ? r.program.substring(0, 18) + '...' : r.program);
  const data = topRows.map(r => r.count);

  state.charts.modal = new Chart(ctx, {
    type: chartType === 'doughnut' ? 'doughnut' : 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Students',
        data: data,
        backgroundColor: CHART_COLORS.slice(0, labels.length),
        borderWidth: 1,
        borderColor: '#1e293b',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: chartType === 'doughnut',
          position: 'right',
          labels: { color: '#cbd5e1', font: { size: 9 }, boxWidth: 10 }
        }
      },
      scales: chartType === 'doughnut' ? {} : {
        x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

function closeModal() {
  document.getElementById('drilldownModal').classList.remove('active');
}

/**
 * ========================================================
 * GOOGLE SHEETS LIVE INTEGRATION
 * ========================================================
 */
async function fetchGoogleSheetData(url, showAlert = true) {
  const feedbackEl = document.getElementById('sheetsSyncFeedback');
  feedbackEl.innerHTML = '<span style="color: var(--accent-cyan);">⏳ Fetching latest data from Google Sheet...</span>';

  try {
    let csvUrl = url.trim();

    // Convert standard Google Sheet sharing link to CSV export link if needed
    if (csvUrl.includes('docs.google.com/spreadsheets/d/')) {
      const match = csvUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match && match[1] && !csvUrl.includes('output=csv') && !csvUrl.includes('gviz/tq')) {
        const sheetId = match[1];
        csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
      }
    }

    // Add cache-busting timestamp so Google Sheets never caches stale entries
    const cacheBustUrl = csvUrl + (csvUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();

    const response = await fetch(cacheBustUrl);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: Ensure the Google Sheet is published or shared publicly.`);
    }

    const csvText = await response.text();
    const parsedData = parseCsvData(csvText);

    if (parsedData.length === 0) {
      throw new Error('No valid student or summary rows found in the provided sheet.');
    }

    // Update rawSummary
    state.rawSummary = parsedData;
    state.dataSourceType = 'googlesheets';
    localStorage.setItem('srdp_google_sheet_url', url);

    // Update sync badge
    const badge = document.getElementById('syncStatusBadge');
    badge.style.background = 'rgba(6, 182, 212, 0.15)';
    badge.style.borderColor = 'rgba(6, 182, 212, 0.3)';
    badge.style.color = '#38bdf8';
    document.getElementById('syncStatusText').textContent = 'Live Google Sheet Connected';

    feedbackEl.innerHTML = `<span style="color: var(--accent-emerald);">✓ Successfully loaded ${parsedData.length} records from Google Sheet!</span>`;
    populateFilterOptions();
    renderDashboard();

    if (showAlert) {
      setTimeout(() => {
        document.getElementById('sheetsBanner').classList.remove('active');
      }, 1500);
    }
  } catch (err) {
    console.error('Google Sheet Sync Error:', err);
    feedbackEl.innerHTML = `<span style="color: var(--accent-rose);">✖ Error: ${escapeHtml(err.message)}</span>`;
  }
}

/**
 * Robust CSV Parser that handles quoted strings and comma separations
 */
function parseCsvData(csvText) {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  // Parse lines into tokens
  const rows = lines.map(line => {
    const tokens = [];
    let insideQuote = false;
    let currentToken = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        tokens.push(currentToken.trim().replace(/^"|"$/g, ''));
        currentToken = '';
      } else {
        currentToken += char;
      }
    }
    tokens.push(currentToken.trim().replace(/^"|"$/g, ''));
    return tokens;
  });

  const header = rows[0].map(h => h.toLowerCase());
  const parsedRecords = [];

  // Find column indices
  let colState = header.findIndex(h => h.includes('state'));
  let colTraining = header.findIndex(h => h.includes('training') || h.includes('program') || h.includes('course'));
  let col2021 = header.findIndex(h => h.includes('2021'));
  let col2022 = header.findIndex(h => h.includes('2022'));
  let col2023 = header.findIndex(h => h.includes('2023'));
  let col2024 = header.findIndex(h => h.includes('2024'));
  let colTotal = header.findIndex(h => h.includes('total') || h.includes('students') || h.includes('count'));

  // Default fallbacks if standard Sheet1 structure
  if (colState === -1) colState = 0;
  if (colTraining === -1) colTraining = 6;
  if (colTotal === -1) colTotal = 5;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const stateVal = row[colState];
    const trainingVal = row[colTraining];

    if (stateVal && trainingVal && stateVal !== 'State') {
      const y21 = col2021 !== -1 ? (parseFloat(row[col2021]) || 0) : 0;
      const y22 = col2022 !== -1 ? (parseFloat(row[col2022]) || 0) : 0;
      const y23 = col2023 !== -1 ? (parseFloat(row[col2023]) || 0) : 0;
      const y24 = col2024 !== -1 ? (parseFloat(row[col2024]) || 0) : 0;
      const tot = colTotal !== -1 && row[colTotal] ? (parseFloat(row[colTotal]) || 0) : (y21 + y22 + y23 + y24);

      parsedRecords.push({
        state: normalizeStateName(stateVal),
        training: trainingVal.trim(),
        y2021: y21,
        y2022: y22,
        y2023: y23,
        y2024: y24,
        total: tot > 0 ? tot : 1
      });
    }
  }

  return parsedRecords;
}

/**
 * Event Listeners Setup
 */
function setupEventListeners() {
  // Filters
  document.getElementById('filterProgram').addEventListener('change', (e) => {
    state.filters.program = e.target.value;
    renderDashboard();
  });

  document.getElementById('filterState').addEventListener('change', (e) => {
    state.filters.state = e.target.value;
    renderDashboard();
  });

  document.getElementById('filterYear').addEventListener('change', (e) => {
    state.filters.year = e.target.value;
    renderDashboard();
  });

  document.getElementById('resetFiltersBtn').addEventListener('click', () => {
    state.filters = { program: 'ALL', state: 'ALL', year: 'ALL' };
    document.getElementById('filterProgram').value = 'ALL';
    document.getElementById('filterState').value = 'ALL';
    document.getElementById('filterYear').value = 'ALL';
    renderDashboard();
  });

  // Table search
  document.getElementById('tableSearchInput')?.addEventListener('input', () => {
    renderStudentRoster();
  });

  // Dynamic Tile Click Events
  document.getElementById('tileTotalStudents').addEventListener('click', () => openTileDrillDown('totalStudents'));
  document.getElementById('tileTotalPrograms').addEventListener('click', () => openTileDrillDown('totalPrograms'));
  document.getElementById('tileTotalStates').addEventListener('click', () => openTileDrillDown('totalStates'));
  document.getElementById('tileTopProgram').addEventListener('click', () => openTileDrillDown('topProgram'));
  document.getElementById('tileTopState').addEventListener('click', () => openTileDrillDown('topState'));
  document.getElementById('tileCohortGrowth').addEventListener('click', () => openTileDrillDown('cohortGrowth'));

  // Keyboard accessibility for tiles (Enter / Space)
  ['tileTotalStudents', 'tileTotalPrograms', 'tileTotalStates', 'tileTopProgram', 'tileTopState', 'tileCohortGrowth'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.click();
      }
    });
  });

  // Modal Close
  document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
  document.getElementById('drilldownModal').addEventListener('click', (e) => {
    if (e.target.id === 'drilldownModal') closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Google Sheets Banner Toggle
  document.getElementById('toggleSheetsBtn').addEventListener('click', () => {
    document.getElementById('sheetsBanner').classList.toggle('active');
  });
  document.getElementById('closeSheetsBanner').addEventListener('click', () => {
    document.getElementById('sheetsBanner').classList.remove('active');
  });

  // Connect Google Sheet Button
  document.getElementById('connectSheetBtn').addEventListener('click', () => {
    const url = document.getElementById('sheetsUrlInput').value;
    if (!url) {
      alert('Please enter a Google Sheet URL or published CSV link.');
      return;
    }
    fetchGoogleSheetData(url, true);
  });

  // Reset to Local Snapshot
  document.getElementById('resetLocalBtn').addEventListener('click', () => {
    localStorage.removeItem('srdp_google_sheet_url');
    document.getElementById('sheetsUrlInput').value = '';
    state.rawSummary = INITIAL_DASHBOARD_DATA.summary;
    state.rawStudents = INITIAL_DASHBOARD_DATA.students;
    state.dataSourceType = 'local';

    const badge = document.getElementById('syncStatusBadge');
    badge.style.background = 'rgba(16, 185, 129, 0.15)';
    badge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
    badge.style.color = '#34d399';
    document.getElementById('syncStatusText').textContent = 'Data Source: Local Snapshot';

    document.getElementById('sheetsSyncFeedback').innerHTML = '<span style="color: var(--accent-emerald);">Reset to original Excel data snapshot.</span>';
    populateFilterOptions();
    renderDashboard();
  });

  // Load Sample Demo Sheet
  document.getElementById('loadSampleSheetBtn').addEventListener('click', () => {
    // Demonstration Google Sheet published CSV format
    const sampleUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTf4rQJ.../pub?output=csv';
    document.getElementById('sheetsUrlInput').value = sampleUrl;
    document.getElementById('sheetsSyncFeedback').innerHTML = `
      <span style="color: var(--text-secondary);">
        Tip: Paste your own Google Sheet URL above and click <strong>Connect & Sync</strong>.
      </span>
    `;
  });
}

/**
 * XSS Security: HTML Escaping helper
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
