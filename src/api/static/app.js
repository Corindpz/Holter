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
  if (name === 'review' && currentSemaine) renderReview();
  if (name === 'signals' && currentSemaine) renderSignals();
  if (name === 'dictionary') renderDictionary();
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
    if (confirm('Lancer l\'analyse IA maintenant ?')) runAnalysis();
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
    <button class="btn btn-primary" onclick="exportPDF()">Exporter rapport PDF</button>
    ${pending > 0 ? '<div class="warn-box" style="margin-top:12px">⚠ ' + pending + ' ticket(s) ANALYSE_REQUISE en attente de validation. L\'export sera déverrouillé après validation complète.</div>' : ''}
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
          ${t.capa_suggere ? '<div style="font-size:11px;color:#E24B4A;margin-top:4px;font-weight:600">⚠ CAPA suggéré</div>' : ''}
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

window.onload = async () => {
  await loadSemaineList();
  if (currentSemaine) await renderDashboard();
  await refreshStatus();
  setInterval(refreshStatus, 15000);
};
