import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Rocket, CheckCircle, ArrowRight, Shield, Zap, FileText } from "lucide-react";
import { motion } from "framer-motion";

export default function ComingSoonPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const subscribeMutation = useMutation({
    mutationFn: async (data: { email: string; name?: string; company?: string }) => {
      const res = await apiRequest("POST", "/api/subscribe", data);
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({ title: "You're on the list!", description: "We'll notify you when Lendry.AI launches." });
    },
    onError: (error: any) => {
      toast({ title: "Something went wrong", description: error.message || "Please try again.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast({ title: "Email is required", variant: "destructive" });
      return;
    }
    subscribeMutation.mutate({
      email: email.trim(),
      name: name.trim() || undefined,
      company: company.trim() || undefined,
    });
  };

  const features = [
    { icon: Zap, title: "AI-Powered Underwriting", description: "Automated document review and deal analysis in seconds, not hours." },
    { icon: FileText, title: "Smart Deal Pipeline", description: "End-to-end loan origination with real-time tracking and collaboration." },
    { icon: Shield, title: "SOC 2 Compliant", description: "Enterprise-grade security with full audit trails and data encryption." },
  ];

  return (
    <div className="min-h-screen bg-[#0F1729] text-white flex flex-col" data-testid="page-coming-soon">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-amber-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-amber-600/5 rounded-full blur-3xl" />
      </div>

      <header className="relative z-10 px-6 py-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-baseline gap-1">
            <span className="text-[22px] font-display font-bold text-white tracking-[0.3em]">LENDRY</span>
            <span className="text-[14px] font-display font-bold text-amber-400 tracking-[0.15em]">AI</span>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium" data-testid="badge-coming-soon">
            <Rocket className="h-3 w-3" />
            Coming Soon
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-24">
        <motion.div
          className="max-w-2xl mx-auto text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight" data-testid="text-headline">
            The Future of{" "}
            <span className="bg-gradient-to-r from-amber-400 to-yellow-500 bg-clip-text text-transparent">
              Loan Origination
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-400 max-w-xl mx-auto leading-relaxed" data-testid="text-subheadline">
            Automate your lending operations with AI-powered underwriting, smart deal pipelines, and enterprise-grade compliance. Built for modern lenders.
          </p>
        </motion.div>

        <motion.div
          className="w-full max-w-md mx-auto mb-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
        >
          {submitted ? (
            <div className="text-center p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm" data-testid="container-success">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2" data-testid="text-success-title">You're on the list!</h3>
              <p className="text-slate-400" data-testid="text-success-message">
                We'll send you an invite when Lendry.AI is ready for beta.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm space-y-5" data-testid="form-subscribe">
              <h3 className="text-lg font-semibold text-center mb-2">Get Early Access</h3>
              <p className="text-sm text-slate-400 text-center mb-4">Join the beta waitlist and be first to experience Lendry.AI.</p>

              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs text-slate-300">Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-amber-400"
                  data-testid="input-name"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs text-slate-300">Email <span className="text-red-400">*</span></Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-amber-400"
                  data-testid="input-email"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="company" className="text-xs text-slate-300">Company</Label>
                <Input
                  id="company"
                  type="text"
                  placeholder="Your company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-amber-400"
                  data-testid="input-company"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-amber-700 text-white font-medium mt-8"
                disabled={subscribeMutation.isPending}
                data-testid="button-subscribe"
              >
                {subscribeMutation.isPending ? "Joining..." : (
                  <span className="flex items-center gap-2">
                    Join the Waitlist <ArrowRight className="h-4 w-4" />
                  </span>
                )}
              </Button>

              <p className="text-[11px] text-slate-500 text-center">
                No spam. We'll only email you about launch updates.
              </p>
            </form>
          )}
        </motion.div>

        <motion.div
          className="max-w-4xl mx-auto grid sm:grid-cols-3 gap-6 w-full"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
        >
          {features.map((feature) => (
            <div
              key={feature.title}
              className="p-6 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/10 transition-colors"
              data-testid={`card-feature-${feature.title.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <feature.icon className="h-8 w-8 text-amber-400 mb-3" />
              <h4 className="font-semibold mb-1.5 text-sm">{feature.title}</h4>
              <p className="text-xs text-slate-400 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </motion.div>
      </main>

      <footer className="relative z-10 px-6 py-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-xs text-slate-500" data-testid="text-copyright">
            &copy; {new Date().getFullYear()} Lendry.AI. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
