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
import { Loader2, CheckCircle2, Copy, ExternalLink } from "lucide-react";
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

function buildBookmarkletJs(captureEndpoint: string, token: string): string {
  // The body of this IIFE runs on the NQX pricer page when the user clicks
  // the bookmarklet. It hooks fetch + XHR to capture the next
  // calculate_rate round-trip, snapshots the form fields, and POSTs the
  // result back to our capture endpoint.
  const src = `
(function(){
  if (window.__lendryNqxCapture) { alert('Lendry capture is already armed on this page.'); return; }
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
    fetch(ENDPOINT, {
      method: 'POST', mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(r){
      if (r.ok) {
        showToast('Capture sent to Lendry. You can close this tab.', '#15803d');
      } else {
        sent = false;
        r.text().then(function(t){ showToast('Capture failed: ' + (t || r.status), '#b91c1c'); });
      }
    }).catch(function(err){
      sent = false;
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

  showToast('Lendry capture armed. Fill out the pricer form and click Calculate Rate.', '#C9A84C');
})();`;
  // Strip newlines for the bookmarklet href
  return src.replace(/\s+/g, " ").trim();
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
    return "javascript:" + encodeURIComponent(buildBookmarkletJs(captureEndpoint, token));
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
      toast({ title: "Bookmarklet copied", description: "Paste it into your bookmarks bar." });
    } catch {
      toast({ title: "Copy failed", description: "Drag the gold link instead.", variant: "destructive" });
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
          <div className="space-y-5 text-[14px]">
            <ol className="space-y-4 list-decimal list-inside">
              <li>
                <strong>Drag this gold link to your bookmarks bar</strong> (or click "Copy" and paste it as a new bookmark).
                <div className="mt-2 flex items-center gap-2">
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
                    <Copy className="h-3 w-3 mr-1" /> Copy
                  </Button>
                </div>
              </li>
              <li>
                <strong>Open the pricer URL in a new tab</strong> and bring it to focus.
                <div className="mt-2">
                  <a
                    href={pricerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline text-[13px]"
                    data-testid="link-open-pricer"
                  >
                    <ExternalLink className="h-3 w-3" /> Open pricer
                  </a>
                </div>
              </li>
              <li>
                <strong>Click the bookmarklet</strong> on the pricer page. A gold toast confirms it's armed.
              </li>
              <li>
                <strong>Fill in any realistic scenario</strong> in the pricer form — every required field — and click <strong>Calculate Rate</strong>.
              </li>
              <li>
                Wait for a green toast saying <em>"Capture sent to Lendry."</em> Then come back to this tab — we'll detect it within a few seconds.
              </li>
            </ol>

            <div className="rounded-md border bg-muted/40 px-3 py-2 flex items-center gap-2 text-[13px]">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Waiting for capture from the pricer page…</span>
            </div>

            <p className="text-[12px] text-muted-foreground">
              Session expires in 15 minutes. The bookmarklet only captures one call, then disarms itself.
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
