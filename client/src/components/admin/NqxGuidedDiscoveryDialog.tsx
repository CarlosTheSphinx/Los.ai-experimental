import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Copy, ExternalLink, Terminal, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface DiscoveryResult {
  schema: unknown;
  suggested: unknown;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pricerUrl: string;
  onComplete: (result: DiscoveryResult) => void;
}

interface StartResponse {
  token: string;
  expiresAt: string;
}

interface PollResponse {
  status: "pending" | "captured" | "expired";
  schema?: unknown;
  suggested?: unknown;
}

function buildCaptureScript(captureEndpoint: string, token: string): string {
  // IIFE pasted into DevTools console on the NQX pricer page (CSP blocks
  // bookmarklets on most NQX tenants). Three things happen here:
  //   1. An overlay shows capture progress.
  //   2. A MutationObserver watches for MUI Select popovers (ul[role=listbox])
  //      opening, and walks React fibers on each <li role=option/menuitem> to
  //      pull the real option ID (the `value` prop) and label. MUI/Next puts
  //      these IDs only in React state, never in DOM attributes — that's why
  //      the previous DOM-scraping approach returned :r2:-outlined garbage.
  //   3. fetch + XHR hooks catch the calculate_rate round-trip. The captured
  //      request body tells us which NQX field ObjectId corresponds to which
  //      option ID we collected via fiber-walk — that's how we glue the two
  //      together on the server to produce a real field→options schema.
  // Persistence: window.__lendryMap is mirrored to sessionStorage so an
  // accidental refresh of the pricer tab is survivable (paste again to resume).
  return `
(function(){
  var TOKEN = ${JSON.stringify(token)};
  var ENDPOINT = ${JSON.stringify(captureEndpoint)};
  var STORAGE_KEY = 'lendryNqxMap_' + TOKEN;
  if (window.__lendryNqxCapture) {
    console.info('[Lendry] capture already armed — reattaching overlay');
    if (typeof window.__lendryRender === 'function') window.__lendryRender();
    return;
  }
  window.__lendryNqxCapture = true;
  var sent = false;

  // ── State ────────────────────────────────────────────────────────────────
  //  fieldMap: { "FICO Score": { label, fieldId?, optionsByLabel: { "720-739": "<optId>", ... } } }
  var fieldMap = {};
  try { var saved = sessionStorage.getItem(STORAGE_KEY); if (saved) fieldMap = JSON.parse(saved) || {}; } catch(e){}
  window.__lendryMap = fieldMap;

  function persist(){
    window.__lendryMap = fieldMap;
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fieldMap)); } catch(e){}
    render();
  }

  // ── Overlay ──────────────────────────────────────────────────────────────
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
      '<button id="__lendry_send" style="background:#C9A84C;color:#0F1629;border:0;padding:7px 14px;border-radius:5px;font:700 12px system-ui,-apple-system,sans-serif;cursor:pointer;">Submit to Lendry</button>' +
      '<button id="__lendry_reset" style="background:transparent;color:#C9A84C;border:1px solid #C9A84C;padding:6px 10px;border-radius:5px;cursor:pointer;font:600 11px system-ui,-apple-system,sans-serif;">Reset</button>' +
      '<button id="__lendry_export" style="background:transparent;color:#888;border:1px solid #444;padding:6px 10px;border-radius:5px;cursor:pointer;font:600 11px system-ui,-apple-system,sans-serif;" title="Download the captured map as JSON (for debugging)">Export JSON</button>' +
    '</div>' +
    '<div style="color:#666;margin-top:8px;font-size:10px;">Clicking Calculate Rate on the pricer also auto-submits.</div>';
  function attachOverlay(){ if (!document.getElementById('__lendry_overlay')) document.body.appendChild(overlay); }
  if (document.body) attachOverlay(); else document.addEventListener('DOMContentLoaded', attachOverlay);

  function render(){
    var list = document.getElementById('__lendry_list');
    if (!list) return;
    var keys = Object.keys(fieldMap);
    if (!keys.length) { list.style.color='#888'; list.textContent = '(no dropdowns captured yet — open one to start)'; return; }
    list.style.color = '#fff';
    list.innerHTML = keys.map(function(k){
      var e = fieldMap[k];
      var n = Object.keys(e.optionsByLabel || {}).length;
      var idBadge = e.fieldId ? '<span style="color:#4ade80;">✓id</span>' : '<span style="color:#f59e0b;">?id</span>';
      return '<div style="padding:2px 0;"><span style="color:#C9A84C;">✓</span> <b>'+ escapeHtml(k) +'</b> — '+ n +' opt'+ (n===1?'':'s') +' ' + idBadge +'</div>';
    }).join('');
  }
  window.__lendryRender = render;
  function escapeHtml(s){ return String(s).replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }

  function setStatus(msg, color){
    var el = document.getElementById('__lendry_status');
    if (el) { el.textContent = msg; if (color) el.style.color = color; }
  }

  // ── React fiber helpers ─────────────────────────────────────────────────
  function getFiber(el){
    for (var k in el){ if (k.indexOf('__reactFiber$')===0 || k.indexOf('__reactInternalInstance$')===0) return el[k]; }
    return null;
  }
  function getReactProps(el){
    for (var k in el){ if (k.indexOf('__reactProps$')===0) return el[k]; }
    return null;
  }

  // Extract the option ID from a <li role=option|menuitem>. MUI stores it as
  // the MenuItem's \`value\` prop — which lives only on the React fiber.
  function extractOptionValue(li){
    // Strategy A — reactProps$ on the <li>
    var p = getReactProps(li);
    if (p && p.value !== undefined && p.value !== null && p.value !== '') return p.value;
    // Strategy B — walk fiber.memoizedProps / parent fiber
    var f = getFiber(li);
    var steps = 0;
    while (f && steps < 6) {
      var mp = f.memoizedProps || f.pendingProps;
      if (mp && mp.value !== undefined && mp.value !== null && mp.value !== '') return mp.value;
      f = f.return;
      steps++;
    }
    // Strategy C — data-value attribute (rare, but some MUI forks add it)
    var dv = li.getAttribute('data-value');
    if (dv) return dv;
    return null;
  }

  // Try to find the NQX field ObjectId (24 hex) by walking up the fiber
  // tree from the listbox. The form component may put the field id on a
  // prop named \`name\`, \`fieldId\`, \`field_id\`, \`id\`, or embed it in
  // any other prop value.
  var OBJID_RE = /^[a-f0-9]{24}$/i;
  function extractFieldIdFromListbox(ul){
    var f = getFiber(ul);
    var steps = 0;
    while (f && steps < 20) {
      var props = f.memoizedProps || f.pendingProps;
      if (props && typeof props === 'object') {
        var named = [props.name, props.fieldId, props.field_id, props.id, props['data-field-id']];
        for (var i=0;i<named.length;i++){ if (typeof named[i]==='string' && OBJID_RE.test(named[i])) return named[i]; }
        // Shallow scan of primitive prop values
        for (var k in props){
          var v = props[k];
          if (typeof v === 'string' && OBJID_RE.test(v)) return v;
        }
      }
      f = f.return;
      steps++;
    }
    return null;
  }

  // Human field name: aria-labelledby on the ul points to a label element.
  function extractFieldLabel(ul){
    try {
      var lb = ul.getAttribute('aria-labelledby');
      if (lb) {
        var ids = lb.split(/\\s+/).filter(Boolean);
        for (var i=0;i<ids.length;i++){
          var el = document.getElementById(ids[i]);
          var t = el && (el.textContent || '').trim();
          if (t) return t;
        }
      }
      // Fallback — aria-label on the ul
      var al = ul.getAttribute('aria-label');
      if (al) return al.trim();
    } catch(e){}
    return null;
  }

  function captureListbox(ul){
    try {
      var label = extractFieldLabel(ul);
      if (!label) {
        console.warn('[Lendry] listbox opened but no field label found', ul);
        return;
      }
      var items = ul.querySelectorAll('li[role="option"], li[role="menuitem"]');
      if (!items.length) return;
      var entry = fieldMap[label] || { label: label, optionsByLabel: {} };
      var captured = 0, failed = 0;
      items.forEach(function(li){
        var optLabel = (li.innerText || li.textContent || '').trim();
        if (!optLabel) return;
        var val = extractOptionValue(li);
        if (val === null || val === undefined) { failed++; try { window.__lendryDebug = { li: li, fiber: getFiber(li), props: getReactProps(li) }; } catch(e){} return; }
        entry.optionsByLabel[optLabel] = String(val);
        captured++;
      });
      if (!entry.fieldId) {
        var fid = extractFieldIdFromListbox(ul);
        if (fid) entry.fieldId = fid;
      }
      if (captured){
        fieldMap[label] = entry;
        console.info('[Lendry] captured "' + label + '" — ' + Object.keys(entry.optionsByLabel).length + ' opts' + (entry.fieldId ? ', fieldId ' + entry.fieldId : ', fieldId unknown (will resolve from calculate_rate)'));
        persist();
      }
      if (failed){
        console.warn('[Lendry] ' + failed + ' option(s) in "' + label + '" had no extractable value. window.__lendryDebug has the last one.');
      }
    } catch(err){
      console.error('[Lendry] captureListbox failed', err);
    }
  }

  // ── MutationObserver for MUI listbox portals ────────────────────────────
  var mo = new MutationObserver(function(muts){
    for (var i=0;i<muts.length;i++){
      var added = muts[i].addedNodes;
      for (var j=0;j<added.length;j++){
        var n = added[j];
        if (!n || n.nodeType !== 1) continue;
        if (n.matches && n.matches('ul[role="listbox"]')) { captureListbox(n); continue; }
        var inner = n.querySelectorAll && n.querySelectorAll('ul[role="listbox"]');
        if (inner && inner.length) for (var k=0;k<inner.length;k++) captureListbox(inner[k]);
      }
    }
  });
  if (document.body) mo.observe(document.body, { childList:true, subtree:true });
  // Also capture any listboxes already open at paste time
  document.querySelectorAll('ul[role="listbox"]').forEach(captureListbox);

  // ── calculate_rate network capture (for field-ID cross-reference) ───────
  var calcCapture = null;
  function gotCalcRate(url, requestBody, responseBody){
    try { if (typeof requestBody === 'string') requestBody = JSON.parse(requestBody); } catch(e){}
    try { if (typeof responseBody === 'string') { var p = JSON.parse(responseBody); responseBody = p; } } catch(e){}
    calcCapture = { url: url, requestBody: requestBody, responseBody: responseBody };
    setStatus('✓ Calculate Rate captured — auto-submitting to Lendry…', '#4ade80');
    console.info('[Lendry] calculate_rate captured');
    submit();
  }
  var origFetch = window.fetch;
  window.fetch = function(input, init){
    var url = (typeof input === 'string') ? input : (input && input.url) || '';
    var body = (init && init.body) ? init.body : null;
    var p = origFetch.apply(this, arguments);
    try {
      p.then(function(res){
        if (!url || url.indexOf('calculate_rate') === -1) return;
        res.clone().text().then(function(t){ gotCalcRate(url, body, t); }).catch(function(){});
      }).catch(function(){});
    } catch(e){}
    return p;
  };
  var XOpen = XMLHttpRequest.prototype.open;
  var XSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m, u){ this.__lendryUrl = u; return XOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function(b){
    var self = this;
    self.addEventListener('load', function(){
      try { if (self.__lendryUrl && self.__lendryUrl.indexOf('calculate_rate') !== -1) gotCalcRate(self.__lendryUrl, b, self.responseText); } catch(e){}
    });
    return XSend.apply(this, arguments);
  };

  // ── Submit / export / reset ─────────────────────────────────────────────
  function submit(){
    if (sent) return;
    var entries = Object.keys(fieldMap).map(function(k){ return fieldMap[k]; });
    if (!entries.length && !calcCapture){
      setStatus('Nothing captured yet. Open a dropdown or hit Calculate Rate.', '#f59e0b');
      return;
    }
    sent = true;
    setStatus('Sending to Lendry…', '#C9A84C');
    var payload = {
      token: TOKEN,
      calculateRateUrl: calcCapture ? calcCapture.url : null,
      requestBody: calcCapture ? calcCapture.requestBody : null,
      responseBody: calcCapture ? calcCapture.responseBody : null,
      fieldMap: entries,
      pageUrl: window.location.href,
      pageTitle: document.title
    };
    fetch(ENDPOINT, {
      method:'POST', mode:'cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    }).then(function(r){
      if (r.ok) {
        setStatus('✓ Sent to Lendry. You can close this tab.', '#4ade80');
        try { sessionStorage.removeItem(STORAGE_KEY); } catch(e){}
        console.info('[Lendry] capture accepted by server');
      } else {
        sent = false;
        r.text().then(function(t){ setStatus('Send failed: ' + (t || r.status), '#f87171'); console.warn('[Lendry] send rejected', r.status, t); });
      }
    }).catch(function(err){
      sent = false;
      setStatus('Network error: ' + err.message, '#f87171');
      console.error('[Lendry] send network error', err);
    });
  }

  function exportJson(){
    try {
      var blob = new Blob([JSON.stringify({ pageUrl: location.href, fieldMap: fieldMap, calcCapture: calcCapture }, null, 2)], { type:'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'nqx_field_map.json';
      document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
    } catch(e){ alert('Export failed: ' + e.message); }
  }

  function bindButtons(){
    var s = document.getElementById('__lendry_send');   if (s) s.onclick = submit;
    var e = document.getElementById('__lendry_export'); if (e) e.onclick = exportJson;
    var r = document.getElementById('__lendry_reset'); if (r) r.onclick = function(){
      if (!confirm('Clear every captured field?')) return;
      fieldMap = {};
      try { sessionStorage.removeItem(STORAGE_KEY); } catch(ee){}
      persist();
    };
    var c = document.getElementById('__lendry_close'); if (c) c.onclick = function(){ overlay.style.display = (overlay.style.display === 'none') ? '' : 'none'; };
  }
  bindButtons();
  render();

  console.info('[Lendry] capture armed. Open each dropdown once; then click Calculate Rate (or Submit to Lendry on the overlay).');
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
  onComplete,
}: Props) {
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "pending" | "captured" | "expired">("idle");
  const [starting, setStarting] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const stopPolling = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  };

  const reset = () => {
    stopPolling();
    setToken(null);
    setStatus("idle");
  };

  useEffect(() => {
    if (!open) reset();
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const startSession = async () => {
    setStarting(true);
    try {
      const res = await apiRequest("POST", "/api/admin/programs/nqx/guided-discovery/start", {});
      const data = (await res.json()) as StartResponse;
      setToken(data.token);
      setStatus("pending");

      pollTimer.current = setInterval(async () => {
        try {
          const r = await apiRequest("GET", `/api/admin/programs/nqx/guided-discovery/${data.token}`);
          const poll = (await r.json()) as PollResponse;
          if (poll.status === "captured" && poll.schema && poll.suggested) {
            stopPolling();
            setStatus("captured");
            onComplete({ schema: poll.schema, suggested: poll.suggested });
            toast({
              title: "Schema captured",
              description: "Field mappings populated from the pricer.",
            });
            setTimeout(() => onOpenChange(false), 1200);
          } else if (poll.status === "expired") {
            stopPolling();
            setStatus("expired");
          }
        } catch {
          // keep polling
        }
      }, 2500);
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

            <div className="rounded-md border border-[#C9A84C]/40 bg-[#C9A84C]/5 px-3 py-2 text-[12px]">
              <strong>Step 3.</strong> A small <strong>Lendry overlay</strong> will appear in the top-right of the pricer page. Open <strong>each dropdown once</strong> (FICO, LTV, Property Type, etc.) — you don't have to select anything, just opening it captures every option. The overlay's checkmarks tick up as you go.
            </div>

            <div className="text-[13px] pt-1">
              <strong>Step 4.</strong> Fill in the rest of the form with a realistic scenario and click <strong>Calculate Rate</strong>. The capture submits automatically and a green status confirms it landed. (You can also click <strong>Submit to Lendry</strong> on the overlay manually.)
            </div>

            <div className="rounded-md border bg-muted/40 px-3 py-2 flex items-center gap-2 text-[13px]">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Waiting for capture from the pricer page…</span>
            </div>

            <p className="text-[12px] text-muted-foreground">
              Session expires in 15 minutes. The capture script only sends one call, then disarms itself. Check the pricer tab's DevTools console for <code className="text-[11px] bg-muted px-1 rounded">[Lendry]</code> log lines if you want to confirm it ran.
            </p>
          </div>
        )}

        {status === "captured" && (
          <div className="flex items-center gap-2 text-green-700 text-[14px]" data-testid="status-discovery-complete">
            <CheckCircle2 className="h-5 w-5" />
            Schema captured. Closing…
          </div>
        )}

        {status === "expired" && (
          <div className="space-y-3 text-[14px]">
            <p className="text-amber-700">This session expired. Start a new one to try again.</p>
            <Button onClick={startSession} disabled={starting} data-testid="button-restart-guided-discovery">
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start a new session"}
            </Button>
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
