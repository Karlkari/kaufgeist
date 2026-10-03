import { siteConfig } from './site-config.mjs';
import { escapeHtml, formatReply, safeAmazonUrl, compactHistory, validSource } from './chat-utils.mjs';

const consentKey = 'kaufgeist_measurement_consent_v2';
const deny = { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
let consent = false;
let analyticsLoaded = false;
let chatHistory = [];
let activeRequest = null;
let requestSequence = 0;
const byId = id => document.getElementById(id);

window.dataLayer = window.dataLayer || [];
window.gtag = function () { window.dataLayer.push(arguments); };
window.gtag('consent', 'default', deny);

function loadAnalytics() {
  if (analyticsLoaded || !consent) return;
  analyticsLoaded = true;
  window.gtag('consent', 'update', { ...deny, analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted' });
  window.gtag('js', new Date());
  const location = `${window.location.origin}${window.location.pathname}`;
  const options = { allow_google_signals: false, allow_ad_personalization_signals: false, page_location: location, page_referrer: '' };
  window.gtag('config', siteConfig.googleAdsId, options);
  if (siteConfig.ga4Id) {
    window.gtag('config', siteConfig.ga4Id, { ...options, send_page_view: false });
    window.gtag('event', 'page_view', { send_to: siteConfig.ga4Id, page_location: location, page_referrer: '', page_title: document.title });
  }
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(siteConfig.googleAdsId)}`;
  document.head.appendChild(script);
}

export function track(name, extra = {}) {
  if (!consent) return;
  // Never send query text, product names, chat content, destination URLs or IDs.
  const page = document.body.dataset.page || 'home';
  const params = { page_type: page, ...extra };
  if (siteConfig.ga4Id) window.gtag('event', name, { ...params, send_to: siteConfig.ga4Id });
  if (name === 'amazon_search_click' && siteConfig.adsOutboundConversionLabel) {
    window.gtag('event', 'conversion', { send_to: `${siteConfig.googleAdsId}/${siteConfig.adsOutboundConversionLabel}` });
  }
}

function clearMeasurementCookies() {
  for (const part of document.cookie.split(';')) {
    const name = part.trim().split('=')[0];
    if (!/^(_ga|_gid|_gat|_gcl_)/.test(name)) continue;
    const host = window.location.hostname;
    const domains = ['', host, `.${host}`, `.${host.split('.').slice(-2).join('.')}`];
    for (const domain of domains) document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax${domain ? `; domain=${domain}` : ''}`;
  }
}
function setConsent(accepted) {
  const reload = analyticsLoaded && !accepted;
  consent = accepted;
  try { localStorage.setItem(consentKey, JSON.stringify({ accepted, at: Date.now(), version: siteConfig.consentVersion })); } catch {}
  byId('consentBanner')?.classList.add('hidden');
  if (accepted) loadAnalytics();
  else {
    window.gtag('consent', 'update', deny);
    if (siteConfig.ga4Id) window[`ga-disable-${siteConfig.ga4Id}`] = true;
    clearMeasurementCookies();
    // A fresh document also stops listeners installed by already-loaded tags.
    if (reload) window.location.reload();
  }
}
function showConsentBanner() { byId('consentBanner')?.classList.remove('hidden'); }
function initializeConsent() {
  let choice;
  try { choice = JSON.parse(localStorage.getItem(consentKey)); } catch {}
  if (choice?.version === siteConfig.consentVersion && Date.now() - choice.at < 180 * 86400000) {
    consent = choice.accepted === true;
    if (consent) loadAnalytics();
  } else showConsentBanner();
}

function scrollToLatestOutput() {
  const latest = byId('chatContainer')?.lastElementChild;
  if (!latest) return;
  const inputHeight = byId('stickyInputSection')?.offsetHeight || 0;
  const top = latest.getBoundingClientRect().top + window.scrollY - 90;
  const bottom = latest.getBoundingClientRect().bottom + window.scrollY - window.innerHeight + inputHeight + 40;
  // Short replies fit entirely; long replies start at their beginning, not card 3.
  window.scrollTo({ top: Math.max(0, Math.min(top, bottom)), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
function setSending(sending) {
  document.querySelectorAll('[data-send]').forEach(button => { button.disabled = sending; });
  byId('chatContainer')?.setAttribute('aria-busy', String(sending));
}
function beginChat(text) {
  if (activeRequest || !text.trim()) return;
  byId('heroInputBox').hidden = true;
  byId('quickTags').hidden = true;
  byId('stickyInputSection').style.display = 'block';
  byId('heroSection').classList.add('chat-active');
  byId('exampleSection')?.setAttribute('hidden', '');
  processSearch(text);
}
function sendFirstMessage() { beginChat(byId('heroInput')?.value || ''); }
function sendMessage() {
  if (activeRequest) return;
  const input = byId('userInput');
  const value = input.value.trim();
  if (!value) return;
  input.value = '';
  processSearch(value);
}
function quickSearch(text) { beginChat(text); }
function resetChat() {
  requestSequence++;
  activeRequest?.abort();
  activeRequest = null;
  chatHistory = [];
  byId('chatContainer')?.replaceChildren();
  if (!byId('heroInputBox')) { window.location.href = '/'; return; }
  byId('heroInputBox').hidden = false;
  byId('quickTags').hidden = false;
  byId('stickyInputSection').style.display = 'none';
  byId('heroSection').classList.remove('chat-active');
  byId('exampleSection')?.removeAttribute('hidden');
  byId('heroInput').value = '';
  byId('heroInput').focus();
  setSending(false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderProduct(product, index) {
  const href = safeAmazonUrl(product.directUrl);
  const sources = (product.sources || []).map(validSource).filter(Boolean).slice(0, 3);
  return `<article class="product-card ${index === 0 ? 'product-primary' : ''}">
    <div><span class="product-badge">${index === 0 ? 'Erste Option für deinen Bedarf' : `Alternative ${index}`}</span>
    <h3 class="product-title">${escapeHtml(product.name)}</h3>
    <p class="product-target">${escapeHtml(product.targetGroup)}</p>
    <p class="product-pros"><strong>Dafür spricht:</strong> ${escapeHtml(product.pros)}</p>
    <p class="product-cons"><strong>Abwägung:</strong> ${escapeHtml(product.cons)}</p></div>
    <div><p class="unverified">Modellvorschlag · Angebot nicht geprüft</p>
    ${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" class="btn-amazon" data-amazon-position="${index + 1}">Modell bei Amazon suchen ↗</a>` : ''}
    <details><summary>Vor dem Kauf prüfen</summary><ul>${(product.checks || []).map(check => `<li>${escapeHtml(check)}</li>`).join('')}</ul><p>${escapeHtml(product.uncertainty)}</p></details>
    ${sources.length ? `<p class="source-links">Recherche: ${sources.map(url => `<a href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url.hostname.replace(/^www\./, ''))}</a>`).join(' · ')}</p>` : ''}
    <p class="product-disclaimer">Normale Amazon-Suche · kein Affiliate-Link.</p></div></article>`;
}

async function processSearch(text) {
  if (activeRequest) return;
  const sequence = ++requestSequence;
  const controller = new AbortController();
  activeRequest = controller;
  const container = byId('chatContainer');
  text = text.trim().slice(0, 1500);
  chatHistory.push({ role: 'user', content: text });
  track(chatHistory.length === 1 ? 'consultation_start' : 'consultation_followup');
  container.insertAdjacentHTML('beforeend', `<div class="msg-user"><div class="msg-user-bubble">${escapeHtml(text)}</div></div>`);
  const loading = document.createElement('div');
  loading.className = 'msg-ai loading';
  loading.innerHTML = '<div class="msg-ai-bubble"><strong>Deine Beratung wird vorbereitet …</strong><p>Je nach Frage werden Anforderungen eingeordnet und Webquellen recherchiert. Das kann einen Moment dauern.</p><button type="button" class="tag-btn" data-cancel>Abbrechen</button></div>';
  loading.querySelector('[data-cancel]').addEventListener('click', () => controller.abort());
  container.appendChild(loading);
  const slowTimer = setTimeout(() => {
    const p = loading.querySelector('p');
    if (p) p.textContent = 'Die Recherche läuft noch. Bitte warte kurz oder brich ab und grenze die Frage weiter ein.';
  }, 14000);
  const timeout = setTimeout(() => controller.abort('timeout'), 52000);
  setSending(true);
  requestAnimationFrame(scrollToLatestOutput);
  try {
    const response = await fetch('/api/recommend', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: compactHistory(chatHistory) }) });
    const data = await response.json();
    if (sequence !== requestSequence) return;
    if (!response.ok || data.error) throw new Error(data.error || 'Die Beratung ist gerade nicht erreichbar.');
    chatHistory.push({ role: 'assistant', content: String(data.reply || '').slice(0, 2400) + '\nModellvorschläge: ' + (data.products || []).map(x => x.name).join(', ') + '\nAktuelle Anforderungen: ' + JSON.stringify(data.requirements || {}) });
    const products = Array.isArray(data.products) ? data.products.slice(0, 3) : [];
    const criteria = data.requirements || {};
    const budget = typeof criteria.maxPrice === 'number' ? `Budgetwunsch: bis ${criteria.maxPrice.toLocaleString('de-DE')} €` : '';
    const required = (criteria.requiredKeywords || []).map(escapeHtml).join(' · ');
    const article = document.createElement('div');
    article.className = 'msg-ai';
    article.innerHTML = `<div class="msg-ai-avatar" aria-hidden="true"><img src="/assets/kaufgeist-icon-256.png" alt=""></div><div class="msg-ai-bubble"><p class="reply-text">${formatReply(data.reply)}</p>${products.length ? `<p class="requirements">${escapeHtml(budget)}${budget && required ? ' · ' : ''}${required}<br>Preis und konkrete Ausstattung sind noch nicht bestätigt.</p><div class="product-grid">${products.map(renderProduct).join('')}</div>` : ''}</div>`;
    article.querySelectorAll('[data-amazon-position]').forEach(link => link.addEventListener('click', () => track('amazon_search_click', { position: Number(link.dataset.amazonPosition) })));
    container.appendChild(article);
    track(products.length ? 'recommendations_shown' : 'clarification_shown', { product_count: products.length });
  } catch (error) {
    if (sequence !== requestSequence) return;
    const message = controller.signal.aborted ? 'Die Anfrage wurde abgebrochen. Du kannst sie erneut stellen.' : error.message || 'Die Verbindung ist gerade nicht verfügbar.';
    container.insertAdjacentHTML('beforeend', `<div class="msg-ai"><div class="msg-ai-bubble error" role="alert">${escapeHtml(message)}</div></div>`);
    track('consultation_error', { reason: controller.signal.aborted ? 'cancelled' : 'unavailable' });
  } finally {
    clearTimeout(timeout); clearTimeout(slowTimer); loading.remove();
    if (sequence === requestSequence) {
      activeRequest = null; setSending(false); requestAnimationFrame(scrollToLatestOutput);
    }
  }
}

Object.assign(window, { setConsent, showConsentBanner, sendFirstMessage, sendMessage, quickSearch, resetChat });
initializeConsent();
