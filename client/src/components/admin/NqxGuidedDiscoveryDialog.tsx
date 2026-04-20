import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, ExternalLink, Terminal, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pricerUrl: string;
}

interface StartResponse {
  token: string;
  expiresAt: string;
}

function buildCaptureScript(_captureEndpoint: string, token: string): string {
  // IIFE pasted into DevTools (or run via bookmarklet) on the NQX pricer page.
  // Captures dropdown options via React fiber walk, captures the calculate_rate
  // request body as a baseline, and exposes window.__lendryMap for live
  // inspection. The Export JSON button on the overlay produces the final map.
  return `
(function(){
  if (window.__lendryNqxCapture) { console.info('[Lendry] capture already armed on this page'); return; }
  window.__lendryNqxCapture = true;
  var TOKEN = ${JSON.stringify(token)};
  var STORAGE_KEY = 'lendryNqxMap_' + TOKEN;
  var OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

  // ── Persistent map (survives refresh via sessionStorage) ──────────────
  var map;
  try { var saved = sessionStorage.getItem(STORAGE_KEY); map = saved ? JSON.parse(saved) : null; } catch(e){ map = null; }
  if (!map) map = { pricerId: null, productId: null, capturedAt: null, fields: {}, numericFields: {}, baselinePayload: null };
  window.__lendryMap = map;

  try {
    var pmatch = window.location.pathname.match(/\\/([a-f0-9]{24})/i);
    if (pmatch) map.pricerId = pmatch[1];
  } catch(e){}

  function persist(){
    map.capturedAt = new Date().toISOString();
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch(e){}
    render();
  }

  // ── Proven extraction path: walk fiber up exactly 6 levels ────────────
  function extractOptionData(li){
    var fiberKey = Object.keys(li).find(function(k){ return k.indexOf('__reactFiber$') === 0; });
    if (!fiberKey) return null;
    var f = li[fiberKey];
    for (var d = 0; d < 6 && f; d++) f = f.return;
    var opt = f && f.memoizedProps && f.memoizedProps.option;
    if (!opt || typeof opt.value !== 'string') return null;
    if (!OBJECT_ID_RE.test(opt.value)) {
      console.warn('[Lendry] discarded option, value is not a 24-hex ObjectId:', opt);
      return null;
    }
    return {
      id: opt.value,
      label: typeof opt.text === 'string' ? opt.text : String(opt.value),
      order: typeof opt.order_num === 'number' ? opt.order_num : 0
    };
  }

  function fieldLabelFromListbox(ul){
    try {
      var labelledBy = ul.getAttribute('aria-labelledby');
      if (labelledBy) {
        var parts = labelledBy.split(/\\s+/).map(function(id){
          var el = document.getElementById(id);
          return el ? (el.textContent || '').trim() : '';
        }).filter(Boolean);
        if (parts.length) return parts.join(' ');
      }
      var aria = ul.getAttribute('aria-label');
      if (aria) return aria.trim();
    } catch(e){}
    return null;
  }

  function resolveFieldIdFromBaseline(options){
    if (!map.baselinePayload || !options || !options.length) return null;
    var optIds = Object.create(null);
    for (var i = 0; i < options.length; i++) optIds[options[i].id] = true;
    for (var k in map.baselinePayload) {
      if (!Object.prototype.hasOwnProperty.call(map.baselinePayload, k)) continue;
      if (!OBJECT_ID_RE.test(k)) continue;
      var v = map.baselinePayload[k];
      if (typeof v === 'string' && optIds[v]) return k;
      if (Array.isArray(v) && v.some(function(x){ return typeof x === 'string' && optIds[x]; })) return k;
    }
    return null;
  }

  function captureDropdown(ul){
    var label = fieldLabelFromListbox(ul);
    if (!label) { console.warn('[Lendry] dropdown opened but aria-labelledby missing — cannot label'); return; }
    var lis = ul.querySelectorAll('li[role="menuitem"], li[role="option"]');
    if (!lis.length) return;
    var seen = Object.create(null);
    var options = [];
    Array.prototype.forEach.call(lis, function(li){
      var d = extractOptionData(li);
      if (d && !seen[d.id]) { seen[d.id] = true; options.push(d); }
    });
    if (!options.length) {
      console.warn('[Lendry] no valid options extracted for', label);
      return;
    }
    options.sort(function(a, b){ return a.order - b.order; });
    var existing = map.fields[label];
    var fieldId = (existing && existing.fieldId) || resolveFieldIdFromBaseline(options);
    map.fields[label] = { fieldId: fieldId, type: 'dropdown', options: options };
    persist();
    console.info('[Lendry] captured', options.length, 'options for "' + label + '"', fieldId ? '→ ' + fieldId : '(fieldId pending)');
  }

  function reconcileFieldIds(){
    var resolved = 0;
    for (var label in map.fields) {
      var f = map.fields[label];
      if (f.fieldId) continue;
      var fid = resolveFieldIdFromBaseline(f.options || []);
      if (fid) { f.fieldId = fid; resolved++; }
    }
    if (resolved) console.info('[Lendry] resolved', resolved, 'pending fieldId(s) from baseline payload');
  }

  // ── Numeric field discovery: walk every <input> fiber, find any prop ──
  // whose value matches a baseline-payload fieldId, then label via DOM.
  function inputLabel(el){
    try {
      if (el.id) {
        var lab = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (lab) return (lab.textContent || '').trim();
      }
      var lblId = el.getAttribute('aria-labelledby');
      if (lblId) {
        var first = document.getElementById(lblId.split(/\\s+/)[0]);
        if (first) return (first.textContent || '').trim();
      }
      var p = el.closest('label');
      if (p) return (p.textContent || '').trim();
      var aria = el.getAttribute('aria-label');
      if (aria) return aria.trim();
    } catch(e){}
    return null;
  }

  function captureNumericFields(){
    if (!map.baselinePayload) return;
    var dropdownIds = Object.create(null);
    for (var lbl in map.fields) {
      var f = map.fields[lbl];
      if (f && f.fieldId) dropdownIds[f.fieldId] = true;
    }
    var numericFieldIds = [];
    for (var k in map.baselinePayload) {
      if (!Object.prototype.hasOwnProperty.call(map.baselinePayload, k)) continue;
      if (!OBJECT_ID_RE.test(k) || dropdownIds[k]) continue;
      var v = map.baselinePayload[k];
      if (typeof v === 'number') { numericFieldIds.push(k); continue; }
      if (typeof v === 'string' && v && /^[\\d.,\\-]+$/.test(v)) numericFieldIds.push(k);
    }
    if (!numericFieldIds.length) return;
    var inputs = document.querySelectorAll('input, textarea');
    var matched = Object.create(null);
    for (var i = 0; i < inputs.length && Object.keys(matched).length < numericFieldIds.length; i++) {
      var el = inputs[i];
      var fk = Object.keys(el).find(function(k){ return k.indexOf('__reactFiber$') === 0; });
      if (!fk) continue;
      var node = el[fk];
      for (var depth = 0; depth < 8 && node; depth++) {
        var props = node.memoizedProps || {};
        for (var pk in props) {
          var pv = props[pk];
          if (typeof pv !== 'string' || !OBJECT_ID_RE.test(pv)) continue;
          if (numericFieldIds.indexOf(pv) !== -1 && !matched[pv]) {
            var label = inputLabel(el) || pv;
            map.numericFields[label] = pv;
            matched[pv] = true;
          }
        }
        node = node.return;
      }
    }
  }

  // ── MutationObserver for opened MUI dropdowns ─────────────────────────
  function processNode(n){
    if (!n || n.nodeType !== 1) return;
    if (n.matches && n.matches('ul[role="listbox"], ul[role="menu"]')) {
      setTimeout(function(){ try { captureDropdown(n); } catch(e){ console.error('[Lendry] capture error', e); } }, 30);
      return;
    }
    if (n.querySelectorAll) {
      var lists = n.querySelectorAll('ul[role="listbox"], ul[role="menu"]');
      Array.prototype.forEach.call(lists, function(ul){
        setTimeout(function(){ try { captureDropdown(ul); } catch(e){ console.error('[Lendry] capture error', e); } }, 30);
      });
    }
  }
  var observer = new MutationObserver(function(muts){
    for (var i = 0; i < muts.length; i++) {
      var added = muts[i].addedNodes;
      for (var j = 0; j < added.length; j++) processNode(added[j]);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // ── Hook fetch/XHR strictly to capture baselinePayload ────────────────
  function captureBaseline(url, requestBody){
    if (!url || url.indexOf('calculate_rate') === -1) return;
    try { if (typeof requestBody === 'string') requestBody = JSON.parse(requestBody); } catch(e){ return; }
    if (!requestBody || typeof requestBody !== 'object') return;
    map.baselinePayload = requestBody;
    try {
      var um = url.match(/products\\/([a-f0-9]{24})/i);
      if (um) map.productId = um[1];
    } catch(e){}
    reconcileFieldIds();
    captureNumericFields();
    persist();
    console.info('[Lendry] baseline payload captured. productId=' + map.productId + ', fields=' + Object.keys(map.fields).length + ', numeric=' + Object.keys(map.numericFields).length);
    setStatus('✓ Baseline captured. Open remaining dropdowns or click Export JSON.');
  }

  var origFetch = window.fetch;
  window.fetch = function(input, init){
    var url = (typeof input === 'string') ? input : (input && input.url) || '';
    var body = (init && init.body) ? init.body : null;
    if (url.indexOf('calculate_rate') !== -1) {
      try { captureBaseline(url, body); } catch(e){ console.error('[Lendry] baseline capture error', e); }
    }
    return origFetch.apply(this, arguments);
  };
  var XOpen = XMLHttpRequest.prototype.open;
  var XSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m, u){ this.__lendryUrl = u; return XOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function(body){
    if (this.__lendryUrl && this.__lendryUrl.indexOf('calculate_rate') !== -1) {
      try { captureBaseline(this.__lendryUrl, body); } catch(e){ console.error('[Lendry] baseline capture error', e); }
    }
    return XSend.apply(this, arguments);
  };

  // ── Floating overlay UI ───────────────────────────────────────────────
  var overlay = document.createElement('div');
  overlay.id = '__lendry_overlay';
  overlay.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;background:#0F1629;color:#fff;padding:14px 16px;border-radius:10px;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;max-width:380px;min-width:290px;box-shadow:0 8px 30px rgba(0,0,0,.4);border:1px solid #C9A84C;';
  overlay.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
      '<div style="font:700 13px system-ui,-apple-system,sans-serif;color:#C9A84C;">⚡ Lendry NQX Capture</div>' +
      '<button id="__lendry_close" style="background:transparent;border:0;color:#888;cursor:pointer;font-size:16px;line-height:1;padding:0 4px;" title="Hide overlay">×</button>' +
    '</div>' +
    '<div id="__lendry_status" style="color:#C9A84C;margin-bottom:8px;">Open each dropdown on the pricer once.</div>' +
    '<div id="__lendry_list" style="max-height:180px;overflow:auto;font-size:11px;margin-bottom:10px;background:rgba(255,255,255,.04);border-radius:6px;padding:6px 8px;"></div>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
      '<button id="__lendry_export" style="background:#C9A84C;color:#0F1629;border:0;padding:7px 14px;border-radius:5px;font:700 12px system-ui,-apple-system,sans-serif;cursor:pointer;">Export JSON</button>' +
      '<button id="__lendry_reset" style="background:transparent;color:#C9A84C;border:1px solid #C9A84C;padding:6px 10px;border-radius:5px;cursor:pointer;font:600 11px system-ui,-apple-system,sans-serif;">Reset</button>' +
    '</div>' +
    '<div style="color:#666;margin-top:8px;font-size:10px;">Click Calculate Rate on the pricer to also capture the baseline payload.</div>';
  function attachOverlay(){ if (!document.getElementById('__lendry_overlay')) document.body.appendChild(overlay); }
  if (document.body) attachOverlay(); else document.addEventListener('DOMContentLoaded', attachOverlay);

  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function setStatus(msg){ var s = document.getElementById('__lendry_status'); if (s) s.textContent = msg; }
  function render(){
    var list = document.getElementById('__lendry_list');
    if (!list) return;
    var labels = Object.keys(map.fields);
    var html = '';
    if (!labels.length) {
      list.style.color = '#888';
      list.textContent = '(no dropdowns captured yet — open one to start)';
    } else {
      list.style.color = '#fff';
      html = labels.map(function(lbl){
        var f = map.fields[lbl];
        var n = (f.options || []).length;
        var idBadge = f.fieldId ? '<span style="color:#4ade80;">✓id</span>' : '<span style="color:#f59e0b;">?id</span>';
        return '<div style="padding:2px 0;"><span style="color:#C9A84C;">✓</span> <b>' + escapeHtml(lbl) + '</b> — ' + n + ' opt' + (n === 1 ? '' : 's') + ' ' + idBadge + '</div>';
      }).join('');
      list.innerHTML = html;
    }
    var nNum = Object.keys(map.numericFields).length;
    var baselineLine = map.baselinePayload
      ? '<div style="color:#4ade80;margin-top:4px;">✓ baseline + ' + nNum + ' numeric field' + (nNum === 1 ? '' : 's') + '</div>'
      : '<div style="color:#888;margin-top:4px;">baseline payload pending — click Calculate Rate</div>';
    if (labels.length) list.innerHTML = html + baselineLine;
  }

  function exportJson(){
    try {
      var blob = new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'lendry-nqx-' + (map.pricerId || 'capture') + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
      console.info('[Lendry] exported map:', map);
    } catch(e){ console.error('[Lendry] export failed', e); }
  }

  function bindButtons(){
    var c = document.getElementById('__lendry_close'); if (c) c.onclick = function(){ overlay.style.display = 'none'; };
    var e = document.getElementById('__lendry_export'); if (e) e.onclick = exportJson;
    var r = document.getElementById('__lendry_reset'); if (r) r.onclick = function(){
      if (!confirm('Clear every captured field?')) return;
      map.fields = {}; map.numericFields = {}; map.baselinePayload = null;
      map.productId = null; map.capturedAt = null;
      try { sessionStorage.removeItem(STORAGE_KEY); } catch(ee){}
      render(); setStatus('Cleared. Open each dropdown again.');
    };
  }
  setTimeout(bindButtons, 100);
  render();

  console.info('[Lendry] capture armed. window.__lendryMap is live — inspect anytime. Open each dropdown once, then click Calculate Rate, then Export JSON.');
})();`;
}

function buildBookmarkletHref(captureEndpoint: string, token: string): string {
  // Bookmarklet URL — single-line, percent-encoded, javascript: scheme.
  const collapsed = buildCaptureScript(captureEndpoint, token).replace(/\s+/g, " ").trim();
  return "javascript:" + encodeURIComponent(collapsed);
}

export function NqxGuidedDiscoveryDialog({
  open,
  onOpenChange,
  pricerUrl,
}: Props) {
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "pending">("idle");
  const [starting, setStarting] = useState(false);

  const captureEndpoint = useMemo(
    () => `${window.location.origin}/api/public/nqx-discovery-capture`,
    [],
  );

  const bookmarkletHref = useMemo(() => {
    if (!token) return "javascript:void(0)";
    return buildBookmarkletHref(captureEndpoint, token);
  }, [token, captureEndpoint]);

  const rawScript = useMemo(() => {
    if (!token) return "";
    return buildCaptureScript(captureEndpoint, token).trim();
  }, [token, captureEndpoint]);

  const reset = () => {
    setToken(null);
    setStatus("idle");
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const startSession = async () => {
    setStarting(true);
    try {
      const res = await apiRequest("POST", "/api/admin/programs/nqx/guided-discovery/start", {});
      const data = (await res.json()) as StartResponse;
      setToken(data.token);
      setStatus("pending");
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Could not start a discovery session.";
      toast({ title: "Failed to start", description: msg, variant: "destructive" });
    } finally {
      setStarting(false);
    }
  };

  const copyBookmarklet = async () => {
    try {
      await navigator.clipboard.writeText(bookmarkletHref);
      toast({ title: "Bookmarklet copied", description: "Paste it into your bookmarks bar as a new bookmark." });
    } catch {
      toast({ title: "Copy failed", description: "Drag the gold link instead.", variant: "destructive" });
    }
  };

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(rawScript);
      toast({
        title: "Script copied",
        description: "Open DevTools → Console on the pricer tab, paste, press Enter.",
      });
    } catch {
      toast({ title: "Copy failed", description: "Try selecting the script box manually.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" data-testid="dialog-nqx-guided-discovery">
        <DialogHeader>
          <DialogTitle>Guided Discovery</DialogTitle>
          <DialogDescription>
            Capture one real <code className="text-[12px] bg-muted/40 px-1 rounded">calculate_rate</code> round-trip from the NQX pricer to build the field schema.
          </DialogDescription>
        </DialogHeader>

        {status === "idle" && (
          <div className="space-y-4 text-[14px]">
            <p className="text-muted-foreground">
              The pricer only fires its API call after you fill in every required field and click Calculate. We'll give you a small bookmarklet that watches for that one call and sends the result back here automatically.
            </p>
            <Button
              onClick={startSession}
              disabled={starting || !pricerUrl}
              className="w-full bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 text-white font-semibold"
              data-testid="button-start-guided-discovery"
            >
              {starting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Starting...</>
              ) : (
                "Start Guided Discovery"
              )}
            </Button>
            {!pricerUrl && (
              <p className="text-[12px] text-amber-700">Enter a Pricer URL first, then start discovery.</p>
            )}
          </div>
        )}

        {status === "pending" && token && (
          <div className="space-y-4 text-[14px] max-h-[70vh] overflow-y-auto pr-1">
            {/* Step 0 — open pricer */}
            <div className="rounded-md border px-3 py-2 flex items-center justify-between gap-2 bg-muted/30">
              <div className="text-[13px]">
                <strong>Step 1.</strong> Open the pricer in a new tab.
              </div>
              <a
                href={pricerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline text-[13px] font-medium"
                data-testid="link-open-pricer"
              >
                <ExternalLink className="h-3 w-3" /> Open pricer
              </a>
            </div>

            <div className="text-[13px] font-medium text-foreground">
              <strong>Step 2.</strong> Run the capture script on that tab — pick whichever option works:
            </div>

            {/* Option A — Bookmarklet */}
            <div className="rounded-md border-2 border-[#C9A84C]/40 bg-[#C9A84C]/5 px-3 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-[13px]">Option A — Bookmarklet (fastest)</div>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">recommended</span>
              </div>
              <p className="text-[12px] text-muted-foreground">
                Drag the gold link to your bookmarks bar (or copy and paste as a new bookmark), switch to the pricer tab, then click the bookmark.
              </p>
              <div className="flex items-center gap-2">
                <a
                  href={bookmarkletHref}
                  onClick={(e) => e.preventDefault()}
                  className="inline-block px-3 py-2 rounded-md font-bold text-[#0F1629] bg-gradient-to-r from-[#C9A84C] to-[#E0C46C] cursor-grab"
                  data-testid="link-bookmarklet"
                  title="Drag me to your bookmarks bar"
                >
                  📌 Lendry NQX Capture
                </a>
                <Button size="sm" variant="outline" onClick={copyBookmarklet} data-testid="button-copy-bookmarklet">
                  <Copy className="h-3 w-3 mr-1" /> Copy bookmarklet
                </Button>
              </div>
            </div>

            {/* CSP callout */}
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 flex items-start gap-2 text-[12px]">
              <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Clicked the bookmarklet and nothing happened?</strong> Your pricer page blocks bookmarklets via Content Security Policy. Use Option B below instead.
              </span>
            </div>

            {/* Option B — DevTools paste */}
            <div className="rounded-md border px-3 py-3 space-y-2">
              <div className="font-semibold text-[13px] flex items-center gap-2">
                <Terminal className="h-3.5 w-3.5" />
                Option B — DevTools paste (works on sites that block bookmarklets)
              </div>
              <ol className="list-decimal list-inside text-[12px] text-muted-foreground space-y-1">
                <li>On the pricer tab, open DevTools — <kbd className="px-1 py-0.5 border rounded bg-muted text-[11px]">F12</kbd> (Win/Linux) or <kbd className="px-1 py-0.5 border rounded bg-muted text-[11px]">⌘⌥J</kbd> (Mac) — and switch to the <strong>Console</strong> tab.</li>
                <li>If the console warns "Don't paste anything here unless you understand it" — type <code className="text-[11px] bg-muted px-1 rounded">allow pasting</code> and press Enter.</li>
                <li>Paste the script below and press Enter.</li>
              </ol>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={copyScript}
                  className="bg-[#0F1629] hover:bg-[#0F1629]/90 text-white"
                  data-testid="button-copy-script"
                >
                  <Copy className="h-3 w-3 mr-1" /> Copy script
                </Button>
                <span className="text-[11px] text-muted-foreground">{rawScript.length.toLocaleString()} chars</span>
              </div>
              <textarea
                readOnly
                value={rawScript}
                onClick={(e) => (e.currentTarget as HTMLTextAreaElement).select()}
                onFocus={(e) => (e.currentTarget as HTMLTextAreaElement).select()}
                className="w-full h-24 text-[10px] font-mono bg-muted/40 border rounded p-2 resize-none"
                data-testid="textarea-capture-script"
              />
            </div>

            <div className="rounded-md border border-[#C9A84C]/40 bg-[#C9A84C]/5 px-3 py-2 text-[12px] space-y-1">
              <div><strong>Step 3.</strong> A floating Lendry overlay appears on the pricer page. Open <strong>each dropdown once</strong> (FICO, LTV, Property Type, etc.). The overlay ticks each one off as it captures the options.</div>
              <div><strong>Step 4.</strong> Fill in any realistic scenario and click <strong>Calculate Rate</strong> on the pricer — that captures the baseline payload and resolves the field IDs.</div>
              <div><strong>Step 5.</strong> Click <strong>Export JSON</strong> in the overlay to download the captured map.</div>
            </div>

            <p className="text-[12px] text-muted-foreground">
              Inspect <code className="text-[11px] bg-muted px-1 rounded">window.__lendryMap</code> in the pricer tab's console at any point to verify progress. The capture is mirrored to <code className="text-[11px] bg-muted px-1 rounded">sessionStorage</code> so a refresh won't lose it. Look for <code className="text-[11px] bg-muted px-1 rounded">[Lendry]</code> log lines for diagnostics.
            </p>
          </div>
        )}

        {status === "pending" && (
          <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-[12px] text-blue-900 dark:text-blue-200">
            <strong>Step 6.</strong> Once you have the downloaded JSON, close this dialog and click{" "}
            <strong>Import captured JSON</strong> to load it into the configuration.
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="button-close-guided-discovery">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
