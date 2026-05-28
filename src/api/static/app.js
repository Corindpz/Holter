let currentSemaine = null;
let currentExpert = null;

async function refreshStatus() {
  try {
    const s = await fetch('/api/status').then(r => r.json());
    const bar = document.getElementById('ai-status-bar');
    if (!bar) return;
    if (!s.ollama_running) {
      bar.className = 'status-bar status-error';
      bar.textContent = '⬤ Ollama non démarré — analyse IA indisponible';
    } else if (!s.model_ready) {
      bar.className = 'status-bar status-warn';
      bar.textContent = `⬤ Modèle non téléchargé (${s.model_selected}) — exécutez : ${s.pull_command}`;
    } else {
      bar.className = 'status-bar status-ok';
      bar.textContent = `⬤ IA prête · ${s.model_selected} · RAM dispo ${s.ram_available_gb} GB`;
    }
  } catch(e) { /* ignore */ }
}

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch('/api' + path, opts);
  if (!r.ok) { const e = await r.json().catch(() => ({detail: r.status})); throw new Error(e.detail || r.status); }
  return r.json();
}

function switchTab(name, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('panel-' + name).classList.add('active');
  if (name === 'analytics' && currentSemaine) loadAnalytics();
  if (name === 'review' && currentSemaine) renderReview();
  if (name === 'signals' && currentSemaine) renderSignals();
  if (name === 'dictionary') renderDictionary();
  if (name === 'exclusions') renderExclusions();
}

async function importCSV() {
  const file = document.getElementById('csv-input').files[0];
  if (!file) return;
  const fd = new FormData(); fd.append('file', file);
  try {
    const r = await fetch('/api/import', { method: 'POST', body: fd });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail);
    alert('Import réussi : ' + data.imported + ' tickets · Semaine ' + data.semaine_code);
    await loadSemaineList();
    document.getElementById('semaine-select').value = data.semaine_code;
    currentSemaine = data.semaine_code;
    await renderDashboard();
    // L'utilisateur lance l'analyse via le bouton du tableau de bord
  } catch(e) { alert('Erreur import : ' + e.message); }
}

async function loadSemaineList() {
  try {
    const semaines = await api('GET', '/semaines');
    const sel = document.getElementById('semaine-select');
    sel.innerHTML = semaines.map(s => `<option value="${s.code}">${s.code}</option>`).join('');
    if (semaines.length > 0 && !currentSemaine) {
      currentSemaine = semaines[0].code;
      sel.value = currentSemaine;
    }
  } catch(e) { /* no semaines yet */ }
}

async function loadSemaine() {
  const sel = document.getElementById('semaine-select');
  currentSemaine = sel.value;
  if (currentSemaine) await renderDashboard();
}

async function runAnalysis() {
  if (!currentSemaine) return;
  try {
    const r = await api('POST', '/analysis/run/' + currentSemaine);
    pollProgress(r.total);
  } catch(e) { alert('Erreur analyse : ' + e.message); }
}

function pollProgress(total) {
  document.getElementById('panel-dashboard').innerHTML =
    '<div class="warn-box">Analyse en cours...<div class="progress-bar"><div class="progress-fill" id="pf" style="width:0%"></div></div><span id="prog-text">0 / ' + total + '</span></div>';
  const iv = setInterval(async () => {
    const p = await api('GET', '/analysis/progress/' + currentSemaine);
    const pct = total > 0 ? Math.round(p.done / total * 100) : 0;
    const pf = document.getElementById('pf');
    if (pf) pf.style.width = pct + '%';
    const pt = document.getElementById('prog-text');
    if (pt) pt.textContent = p.done + ' / ' + total;
    if (!p.running) { clearInterval(iv); renderDashboard(); }
  }, 2000);
}

async function renderDashboard() {
  if (!currentSemaine) return;
  const tickets = await api('GET', '/analysis/' + currentSemaine);
  const kpis = { total: tickets.length, analyse_requise: 0, surveiller: 0, clos: 0 };
  tickets.forEach(t => {
    const d = (t.decision || 'CLOS').toUpperCase();
    if (d === 'ANALYSE_REQUISE') kpis.analyse_requise++;
    else if (d === 'SURVEILLER') kpis.surveiller++;
    else kpis.clos++;
  });
  const pending = kpis.analyse_requise - tickets.filter(t => t.action_expert).length;
  const badge = document.getElementById('badge-pending');
  if (badge) badge.textContent = pending > 0 ? pending : '';
  document.getElementById('panel-dashboard').innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-label">Tickets analysés</div><div class="kpi-value">${kpis.total}</div></div>
      <div class="kpi kpi-red"><div class="kpi-label">Analyse requise</div><div class="kpi-value">${kpis.analyse_requise}</div></div>
      <div class="kpi kpi-amber"><div class="kpi-label">À surveiller</div><div class="kpi-value">${kpis.surveiller}</div></div>
      <div class="kpi kpi-green"><div class="kpi-label">Clos automatiquement</div><div class="kpi-value">${kpis.clos}</div></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <button class="btn btn-primary" onclick="runAnalysis()" id="btn-analyse">▶ Lancer l'analyse IA</button>
      <button class="btn" onclick="exportPDF()">Exporter rapport PDF</button>
    </div>
    ${kpis.clos > 0 && kpis.total > 0 ? '<div style="font-size:11px;color:#888;margin-bottom:8px">Analyse déjà effectuée · ' + kpis.clos + ' tickets clos, ' + kpis.analyse_requise + ' à réviser. Relancer écrasera les résultats existants.</div>' : ''}
    ${pending > 0 ? '<div class="warn-box" style="margin-top:4px">⚠ ' + pending + ' ticket(s) ANALYSE_REQUISE en attente de validation. L\'export sera déverrouillé après validation complète.</div>' : ''}
  `;
}

async function renderReview() {
  if (!currentSemaine) return;
  if (!currentExpert) currentExpert = prompt('Votre nom (expert de la semaine) :') || 'Expert';
  const tickets = await api('GET', '/analysis/' + currentSemaine);
  const toReview = tickets.filter(t => t.decision === 'ANALYSE_REQUISE' && !t.action_expert);
  document.getElementById('panel-review').innerHTML = `
    <div style="background:#f0f4ff;border:1px solid #c5d3f0;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:13px">
      Expert de la semaine : <strong>${currentExpert}</strong> · ${toReview.length} ticket(s) à valider
    </div>
    ${toReview.length === 0 ? '<p style="color:#1D9E75;padding:10px;font-weight:600">✓ Tous les tickets ont été validés.</p>' : ''}
    ${toReview.map(t => `
    <div class="ticket-card" id="card-${t.id}">
      <div class="ticket-header">
        <div>
          <span style="font-size:11px;color:#888">#${t.id}</span>
          <div style="font-size:14px;font-weight:600;margin:2px 0">${t.objet || ''}</div>
          <div style="font-size:12px;color:#888">${t.produit || ''} · ${t.site || ''} · ${t.priorite || ''}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;text-align:right">
          ${t.signal ? '<span class="chip chip-' + t.signal.toLowerCase() + '">' + t.signal + '</span>' : ''}
          ${t.niveau ? '<span class="chip chip-' + t.niveau.toLowerCase() + '">' + t.niveau + '</span>' : ''}
          <span style="font-size:11px;color:#888">${Math.round((t.confiance||0)*100)}% conf.</span>
        </div>
      </div>
      <div class="ticket-body">
        <div class="raqa-text">${t.raisonnement || ''}</div>
        ${t.capa_suggere ? '<div style="font-size:12px;color:#E24B4A;margin-top:6px;font-weight:600;padding:6px 8px;background:#fff5f5;border-radius:4px;border-left:3px solid #E24B4A">⚠ CAPA suggéré' + (t.capa_justification ? '<br><span style="font-weight:400;color:#333">' + t.capa_justification + '</span>' : '') + '</div>' : ''}
        <div class="action-bar">
          <button class="btn" onclick="decide('${t.id}','CONFIRMER','${t.decision}',null)">✓ Confirmer</button>
          <button class="btn btn-red" onclick="reclasser('${t.id}','${t.decision}')">↺ Reclasser</button>
          <button class="btn" onclick="ecarter('${t.id}')">✕ Écarter</button>
          <button class="btn" onclick="addToDict()">+ Dictionnaire</button>
        </div>
      </div>
    </div>`).join('')}
  `;
}

async function decide(ticketId, action, decisionFinale, commentaire) {
  if (!currentExpert) currentExpert = prompt('Votre nom :') || 'Expert';
  await api('POST', '/review/decision', {
    ticket_id: ticketId, semaine_code: currentSemaine,
    expert_nom: currentExpert, action, decision_finale: decisionFinale, commentaire
  });
  const card = document.getElementById('card-' + ticketId);
  if (card) card.style.opacity = '0.4';
  const p = await api('GET', '/review/pending/' + currentSemaine);
  const badge = document.getElementById('badge-pending');
  if (badge) badge.textContent = p.pending > 0 ? p.pending : '';
}

function reclasser(ticketId, currentDecision) {
  const choices = ['ANALYSE_REQUISE','SURVEILLER','CLOS'].filter(d => d !== currentDecision).join(' / ');
  const newDecision = prompt('Reclasser en (' + choices + ') :');
  if (!newDecision) return;
  const comment = prompt('Commentaire obligatoire :');
  if (!comment) { alert('Commentaire requis'); return; }
  decide(ticketId, 'RECLASSER', newDecision.toUpperCase(), comment);
}

function ecarter(ticketId) {
  const comment = prompt('Justification obligatoire :');
  if (!comment) { alert('Justification requise'); return; }
  decide(ticketId, 'ECARTER', 'CLOS', comment);
}

function addToDict() {
  const pattern = prompt('Pattern à ajouter au dictionnaire :');
  if (!pattern) return;
  const signal = prompt('Signal (MV / IV / SECU) :');
  const niveau = prompt('Niveau (CRITIQUE / MAJEUR / MINEUR) :');
  const article = prompt('Article réglementaire (ex: MDR Art.87) :') || '';
  const expert = currentExpert || prompt('Votre nom :') || 'Expert';
  api('POST', '/dictionary', {
    pattern, signal, niveau, article,
    cree_par: expert, date_creation: new Date().toISOString().slice(0,10)
  }).then(() => alert('Entrée ajoutée au dictionnaire.')).catch(e => alert(e.message));
}

async function renderSignals() {
  if (!currentSemaine) return;
  const tickets = await api('GET', '/analysis/' + currentSemaine);
  const signals = tickets.filter(t => t.signal && ['MV','IV','SECU'].includes(t.signal));
  document.getElementById('panel-signals').innerHTML = signals.length === 0
    ? '<p style="color:#888;padding:20px">Aucun signal vigilance détecté.</p>'
    : signals.map(t => `
      <div class="ticket-card">
        <div class="ticket-header">
          <div>
            <span class="chip chip-${t.signal.toLowerCase()}">${t.signal}</span>
            ${t.niveau ? '<span class="chip chip-' + t.niveau.toLowerCase() + '" style="margin-left:4px">' + t.niveau + '</span>' : ''}
            <div style="font-size:14px;font-weight:600;margin:4px 0">${t.objet || ''}</div>
            <div style="font-size:12px;color:#888">#${t.id} · ${t.produit || ''} · ${t.site || ''}</div>
          </div>
        </div>
        <div class="ticket-body">
          <div class="raqa-text">${t.raisonnement || ''}</div>
          ${t.capa_suggere ? '<div style="font-size:11px;color:#E24B4A;margin-top:6px;font-weight:600">⚠ CAPA suggéré' + (t.capa_justification ? ' — ' + t.capa_justification : '') + '</div>' : ''}
        </div>
      </div>`).join('');
}

async function renderDictionary() {
  const entries = await api('GET', '/dictionary');
  document.getElementById('panel-dictionary').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:13px;color:#888">${entries.length} entrée(s)</div>
    </div>
    <table>
      <thead><tr><th>Pattern</th><th>Signal</th><th>Niveau</th><th>Article</th><th>Créé par</th><th>Semaines validées</th><th>Poids</th><th></th></tr></thead>
      <tbody>
        ${entries.map(e => '<tr><td><strong>' + e.pattern + '</strong></td><td><span class="chip chip-' + e.signal.toLowerCase() + '">' + e.signal + '</span></td><td>' + e.niveau + '</td><td style="font-size:11px;color:#888">' + (e.article || '') + '</td><td style="font-size:11px;color:#888">' + e.cree_par + '</td><td style="text-align:center">' + e.semaines_validees + '</td><td>' + e.poids + '</td><td><button class="btn" onclick="deleteEntry(\'' + e.pattern + '\')">✕</button></td></tr>').join('')}
      </tbody>
    </table>
  `;
}

async function renderExclusions() {
  const rules = await api('GET', '/exclusions');
  const champOpts = ['site','produit','objet','type'].map(c => `<option value="${c}">${c}</option>`).join('');
  const opOpts = [['contient','contient'],['egal','égal à'],['commence_par','commence par']].map(([v,l]) => `<option value="${v}">${l}</option>`).join('');
  document.getElementById('panel-exclusions').innerHTML = `
    <div style="margin-bottom:16px">
      <div style="font-size:13px;color:#888;margin-bottom:10px">Les tickets correspondant à une règle active sont exclus de l'analyse IA (CLOS automatique, documenté dans le rapport).</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;background:white;padding:14px;border-radius:8px;border:1px solid #eee">
        <div><label style="font-size:11px;color:#888;display:block;margin-bottom:3px">Champ</label>
          <select id="ex-champ" style="padding:6px 8px;border:1px solid #ddd;border-radius:5px;font-size:13px">${champOpts}</select></div>
        <div><label style="font-size:11px;color:#888;display:block;margin-bottom:3px">Opérateur</label>
          <select id="ex-op" style="padding:6px 8px;border:1px solid #ddd;border-radius:5px;font-size:13px">${opOpts}</select></div>
        <div><label style="font-size:11px;color:#888;display:block;margin-bottom:3px">Valeur</label>
          <input id="ex-val" placeholder="ex: RH, DSI, Sage X3" style="padding:6px 8px;border:1px solid #ddd;border-radius:5px;font-size:13px;width:180px"></div>
        <div><label style="font-size:11px;color:#888;display:block;margin-bottom:3px">Raison</label>
          <input id="ex-raison" placeholder="ex: Hors périmètre PMS" style="padding:6px 8px;border:1px solid #ddd;border-radius:5px;font-size:13px;width:200px"></div>
        <button class="btn btn-primary" onclick="addExclusion()">+ Ajouter règle</button>
      </div>
    </div>
    ${rules.length === 0 ? '<p style="color:#888;padding:10px">Aucune règle d\'exclusion.</p>' : ''}
    ${rules.length > 0 ? `<table>
      <thead><tr><th>Champ</th><th>Opérateur</th><th>Valeur</th><th>Raison</th><th>Créé par</th><th>Statut</th><th></th></tr></thead>
      <tbody>
        ${rules.map(r => `<tr style="opacity:${r.actif ? 1 : 0.45}">
          <td><strong>${r.champ}</strong></td>
          <td style="color:#888">${r.operateur}</td>
          <td>${r.valeur}</td>
          <td style="color:#666">${r.raison}</td>
          <td style="font-size:11px;color:#aaa">${r.cree_par}</td>
          <td><span style="font-size:11px;font-weight:600;color:${r.actif ? '#2e7d32' : '#999'}">${r.actif ? '● Actif' : '○ Inactif'}</span></td>
          <td style="display:flex;gap:4px">
            <button class="btn" onclick="toggleExclusion(${r.id})" title="${r.actif ? 'Désactiver' : 'Activer'}">${r.actif ? '⏸' : '▶'}</button>
            <button class="btn" onclick="deleteExclusion(${r.id})">✕</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>` : ''}
  `;
}

async function addExclusion() {
  const champ = document.getElementById('ex-champ').value;
  const op = document.getElementById('ex-op').value;
  const val = document.getElementById('ex-val').value.trim();
  const raison = document.getElementById('ex-raison').value.trim();
  if (!val || !raison) return alert('Valeur et raison obligatoires.');
  const expert = currentExpert || prompt('Votre nom :') || 'Expert';
  await api('POST', '/exclusions', { champ, operateur: op, valeur: val, raison, cree_par: expert });
  renderExclusions();
}

async function toggleExclusion(id) {
  await api('PATCH', '/exclusions/' + id);
  renderExclusions();
}

async function deleteExclusion(id) {
  if (!confirm('Supprimer cette règle ?')) return;
  await api('DELETE', '/exclusions/' + id);
  renderExclusions();
}

async function deleteEntry(pattern) {
  if (!confirm('Supprimer "' + pattern + '" du dictionnaire ?')) return;
  await api('DELETE', '/dictionary/' + encodeURIComponent(pattern));
  renderDictionary();
}

async function exportPDF() {
  const r = await fetch('/api/export/pdf/' + currentSemaine, { method: 'POST' });
  if (!r.ok) { const e = await r.json().catch(() => ({detail: 'Erreur'})); return alert(e.detail); }
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'holter_pms_' + currentSemaine + '.pdf';
  a.click();
}

let _trendChart = null;
let _produitChart = null;
let _currentPriorities = [];

async function loadAnalytics() {
  const panel = document.getElementById('panel-analytics');
  if (!currentSemaine) {
    panel.innerHTML = '<p style="color:#888;padding:20px">Sélectionnez une semaine.</p>';
    return;
  }
  panel.innerHTML = '<p style="color:#888;padding:20px">Chargement des tendances...</p>';
  try {
    const data = await api('GET', '/analytics/trends/' + currentSemaine);
    renderTrendsCharts(data);
    try {
      const priData = await api('GET', '/analytics/priorities/' + currentSemaine);
      _currentPriorities = priData.recommendations || [];
      renderPriorities(priData);
    } catch (_) {
      renderPriorities(null);
    }
  } catch (e) {
    panel.innerHTML = '<p style="color:#c00;padding:20px">Erreur : ' + e.message + '</p>';
  }
}

function renderTrendsCharts(data) {
  const panel = document.getElementById('panel-analytics');
  panel.innerHTML = `
    <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:6;min-width:300px">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:12px;color:#333">Tendances signaux — 13 semaines glissantes</h3>
        <canvas id="chart-trends" height="200"></canvas>
        <h3 style="font-size:14px;font-weight:600;margin:20px 0 12px;color:#333">Top produits par score composite</h3>
        <canvas id="chart-produits" height="200"></canvas>
      </div>
      <div style="flex:4;min-width:260px" id="priorities-zone">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 style="font-size:14px;font-weight:600;color:#333;margin:0">Priorités IA</h3>
          <button class="btn btn-primary" onclick="generatePriorities()" id="btn-gen-pri">Générer les priorités IA</button>
        </div>
        <div id="priorities-content"><p style="color:#888;font-size:13px">Aucune recommandation générée.</p></div>
      </div>
    </div>`;

  if (_trendChart) { _trendChart.destroy(); _trendChart = null; }
  const ctx1 = document.getElementById('chart-trends').getContext('2d');
  _trendChart = new Chart(ctx1, {
    type: 'line',
    data: {
      labels: data.semaines,
      datasets: [
        { label: 'MV', data: data.series.MV, borderColor: '#e53935', backgroundColor: 'rgba(229,57,53,0.08)', tension: 0.3, fill: true },
        { label: 'IV', data: data.series.IV, borderColor: '#fb8c00', backgroundColor: 'rgba(251,140,0,0.08)', tension: 0.3, fill: true },
        { label: 'SECU', data: data.series.SECU, borderColor: '#1e88e5', backgroundColor: 'rgba(30,136,229,0.08)', tension: 0.3, fill: true },
      ]
    },
    options: { responsive: true, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true } } }
  });

  if (_produitChart) { _produitChart.destroy(); _produitChart = null; }
  const ctx2 = document.getElementById('chart-produits').getContext('2d');
  const top = (data.top_produits || []).slice(0, 10);
  _produitChart = new Chart(ctx2, {
    type: 'bar',
    data: {
      labels: top.map(p => (p.velocite > 2.0 ? '🔴 ' : '') + p.produit),
      datasets: [{
        label: 'Score composite',
        data: top.map(p => p.score),
        backgroundColor: top.map(p => p.score > 70 ? 'rgba(229,57,53,0.7)' : p.score > 40 ? 'rgba(251,140,0,0.7)' : 'rgba(67,160,71,0.7)'),
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, max: 100 } }
    }
  });
}

function renderPriorities(priData) {
  const zone = document.getElementById('priorities-content');
  if (!zone) return;
  if (!priData || !priData.recommendations || priData.recommendations.length === 0) {
    zone.innerHTML = '<p style="color:#888;font-size:13px">Aucune recommandation générée.<br><span style="font-size:11px">Lancez l\'analyse IA, puis cliquez "Générer les priorités IA".</span></p>';
    return;
  }
  _currentPriorities = priData.recommendations;
  const ts = priData.generated_at ? new Date(priData.generated_at).toLocaleString('fr-FR') : '';
  zone.innerHTML = `
    <div style="font-size:11px;color:#888;margin-bottom:10px">Générées le ${ts}</div>
    ${priData.recommendations.map((r, i) => `
    <div style="background:white;border:1px solid #eee;border-radius:8px;padding:12px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;
          background:${r.score > 70 ? '#fce4ec' : r.score > 40 ? '#fff8e1' : '#e8f5e9'};
          color:${r.score > 70 ? '#c62828' : r.score > 40 ? '#e65100' : '#2e7d32'}">Score ${r.score}</span>
        <span style="font-size:11px;color:#888">Priorité #${r.rang}</span>
      </div>
      <div style="font-size:13px;font-weight:600;margin-bottom:4px">${r.titre}</div>
      <div style="font-size:11px;color:#888;margin-bottom:6px">${r.cluster}</div>
      <div style="font-size:12px;margin-bottom:4px"><strong>Action :</strong> ${r.action_suggeree}</div>
      <div style="font-size:11px;color:#e65100;margin-bottom:8px">⏱ ${r.delai_reglementaire}</div>
      <button class="btn" onclick="showJustificationModal(${i})" style="font-size:11px">Voir justification MDR</button>
    </div>`).join('')}`;
}

async function generatePriorities() {
  if (!currentSemaine) return;
  const btn = document.getElementById('btn-gen-pri');
  if (btn) { btn.disabled = true; btn.textContent = 'Génération en cours...'; }
  try {
    const priData = await api('POST', '/analytics/priorities/' + currentSemaine);
    renderPriorities(priData);
  } catch (e) {
    alert('Erreur génération priorités : ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Générer les priorités IA'; }
  }
}

function showJustificationModal(idx) {
  const r = _currentPriorities[idx];
  if (!r) return;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div style="background:white;border-radius:12px;padding:24px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.2)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
        <h3 style="font-size:15px;font-weight:700;margin:0;flex:1">${r.titre}</h3>
        <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#888;margin-left:12px">✕</button>
      </div>
      <div style="font-size:12px;color:#888;margin-bottom:12px">${r.cluster}</div>
      <div style="font-size:13px;line-height:1.7;margin-bottom:16px;color:#333">${r.justification}</div>
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:600;color:#555;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Articles réglementaires</div>
        <div>${r.articles_mdr.map(a => '<span style="font-size:11px;padding:3px 10px;background:#f0f4ff;border-radius:10px;margin:2px;display:inline-block">' + a + '</span>').join('')}</div>
      </div>
      <div style="font-size:12px;padding:12px;background:#fff8e1;border-radius:6px;border-left:3px solid #f57f17">
        <div style="margin-bottom:4px"><strong>Action :</strong> ${r.action_suggeree}</div>
        <div><strong>Délai réglementaire :</strong> ${r.delai_reglementaire}</div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

window.onload = async () => {
  await loadSemaineList();
  if (currentSemaine) await renderDashboard();
  await refreshStatus();
  setInterval(refreshStatus, 15000);
};
