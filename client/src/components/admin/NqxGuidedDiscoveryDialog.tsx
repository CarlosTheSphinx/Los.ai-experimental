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
  // The body of this IIFE runs on the NQX pricer page either via a
  // bookmarklet click or by being pasted into DevTools. It hooks
  // fetch + XHR to capture the next calculate_rate round-trip,
  // snapshots the form fields, and POSTs the result back.
  return `
(function(){
  if (window.__lendryNqxCapture) { console.info('[Lendry] capture already armed on this page'); alert('Lendry capture is already armed on this page.'); return; }
  window.__lendryNqxCapture = true;
  var TOKEN = ${JSON.stringify(token)};
  var ENDPOINT = ${JSON.stringify(captureEndpoint)};
  var sent = false;

  function showToast(msg, color){
    try {
      var el = document.createElement('div');
      el.textContent = msg;
      el.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;padding:12px 16px;border-radius:8px;font:600 14px system-ui,-apple-system,sans-serif;color:#fff;background:'+ (color || '#0F1629') +';box-shadow:0 4px 14px rgba(0,0,0,.25);max-width:340px;';
      document.body.appendChild(el);
      setTimeout(function(){ el.style.transition='opacity .4s'; el.style.opacity='0'; setTimeout(function(){ el.remove(); }, 450); }, 6000);
    } catch(e){}
  }

  function snapshotDom(){
    var fields = [];
    function labelFor(el){
      try {
        if (el.id) {
          var lab = document.querySelector('label[for="'+CSS.escape(el.id)+'"]');
          if (lab) return (lab.textContent||'').trim();
        }
        var p = el.closest('label');
        if (p) return (p.textContent||'').trim();
        var aria = el.getAttribute('aria-label');
        if (aria) return aria.trim();
        var ph = el.getAttribute('placeholder');
        if (ph) return ph.trim();
      } catch(e){}
      return el.name || el.id || '';
    }
    var seen = {};
    document.querySelectorAll('input, select, textarea, [role="combobox"]').forEach(function(el){
      var name = el.getAttribute('name') || el.getAttribute('data-field-id') || el.id || '';
      if (!name || seen[name]) return;
      seen[name] = true;
      var type = (el.tagName === 'SELECT') ? 'select' : (el.getAttribute('type') || el.tagName.toLowerCase());
      var options;
      if (el.tagName === 'SELECT') {
        options = [];
        Array.prototype.slice.call(el.options).forEach(function(o){
          if (o.value) options.push({ label: (o.textContent||'').trim(), value: o.value });
        });
      }
      fields.push({ opaqueId: name, label: labelFor(el), type: type, options: options });
    });
    return fields;
  }

  function send(payload){
    if (sent) return;
    sent = true;
    console.info('[Lendry] sending capture for', payload.calculateRateUrl);
    fetch(ENDPOINT, {
      method: 'POST', mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(r){
      if (r.ok) {
        console.info('[Lendry] capture accepted by server');
        showToast('Capture sent to Lendry. You can close this tab.', '#15803d');
      } else {
        sent = false;
        r.text().then(function(t){
          console.warn('[Lendry] capture rejected', r.status, t);
          showToast('Capture failed: ' + (t || r.status), '#b91c1c');
        });
      }
    }).catch(function(err){
      sent = false;
      console.error('[Lendry] capture network error', err);
      showToast('Capture network error: ' + err.message, '#b91c1c');
    });
  }

  function maybeCapture(url, requestBody, responseBody){
    if (!url || url.indexOf('calculate_rate') === -1) return;
    try { if (typeof requestBody === 'string') requestBody = JSON.parse(requestBody); } catch(e){}
    try { if (typeof responseBody === 'string') { var parsed = JSON.parse(responseBody); responseBody = parsed; } } catch(e){}
    send({
      token: TOKEN,
      calculateRateUrl: url,
      requestBody: requestBody,
      responseBody: responseBody,
      domFields: snapshotDom(),
      pageTitle: document.title
    });
  }

  // Hook fetch
  var origFetch = window.fetch;
  window.fetch = function(input, init){
    var url = (typeof input === 'string') ? input : (input && input.url) || '';
    var bodyForCapture = (init && init.body) ? init.body : null;
    var p = origFetch.apply(this, arguments);
    p.then(function(res){
      try {
        if (url.indexOf('calculate_rate') !== -1) {
          res.clone().text().then(function(text){ maybeCapture(url, bodyForCapture, text); }).catch(function(){});
        }
      } catch(e){}
    }).catch(function(){});
    return p;
  };

  // Hook XHR
  var XOpen = XMLHttpRequest.prototype.open;
  var XSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m, u){ this.__lendryUrl = u; return XOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function(body){
    var self = this;
    self.addEventListener('load', function(){
      try {
        if (self.__lendryUrl && self.__lendryUrl.indexOf('calculate_rate') !== -1) {
          maybeCapture(self.__lendryUrl, body, self.responseText);
        }
      } catch(e){}
    });
    return XSend.apply(this, arguments);
  };

  console.info('[Lendry] capture armed — fill the form and click Calculate Rate');
  showToast('Lendry capture armed. Fill out the pricer form and click Calculate Rate.', '#C9A84C');
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

            <div className="text-[13px] pt-1">
              <strong>Step 3.</strong> On the pricer tab, fill in any realistic scenario — every required field — and click <strong>Calculate Rate</strong>. A green toast confirms the capture was sent.
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
