import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PublicLayout } from "@/components/PublicLayout";
import {
  FileText,
  Zap,
  Target,
  ChevronDown,
  Shield,
  Play,
  TrendingDown,
  Clock,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { motion } from "framer-motion";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] },
  },
};

export default function PublicHomePage() {
  // Problem section data
  const problemCards = [
    {
      icon: AlertCircle,
      title: "Hiring Costs",
      description: "Each new FTE costs $80K+ plus 3 months to train. You're scaling operations slower than your sales.",
    },
    {
      icon: TrendingDown,
      title: "Margin Loss",
      description: "Ops headcount grows faster than revenue. You're profitable today but squeezed tomorrow.",
    },
    {
      icon: Clock,
      title: "Speed Limits",
      description: "Your best processor reviews ~50 loans/month. Your marketing can drive 500 applications. The gap is your bottleneck.",
    },
    {
      icon: AlertCircle,
      title: "Manual Errors",
      description: "Documents slip through cracks. Borrowers chase status. Deals stall. Human limits = revenue limits.",
    },
  ];

  // Benefit cards (redesigned)
  const benefitCards = [
    {
      icon: FileText,
      title: "Smart Document Processing",
      description: "Verify in 60 seconds. One portal for all documents, status, and updates. Borrowers see green checkmarks instantly. Alerts to your team. Nothing falls through cracks.",
    },
    {
      icon: Zap,
      title: "Borrower Voice",
      description: "Automate all borrower messages—status updates, document requests, approvals. 80% less time in email. Borrowers always know where they stand. Higher close rates.",
    },
    {
      icon: Target,
      title: "Loan Program Automation",
      description: "Set up once. Run forever. 5 minutes to configure. No rewrites. Your programs execute 24/7 on every deal—perfectly, consistently, always.",
    },
  ];

  // How it works (compressed to 3 steps)
  const howItWorks = [
    {
      number: "01",
      title: "Connect",
      description: "Connect your existing CRM and loan management systems. Lendry integrates with your stack in minutes, not months.",
    },
    {
      number: "02",
      title: "Configure",
      description: "Define your loan programs, approval criteria, and communication rules. Takes 5 minutes. No IT required.",
    },
    {
      number: "03",
      title: "Close",
      description: "Your AI agents take over. Document review, borrower communication, deal routing—24/7, automatically. Start closing 3x more deals with the same team.",
    },
  ];

  return (
    <PublicLayout>
      {/* ===== HERO (Simplified) ===== */}
      <section className="relative bg-[#0F1729] overflow-hidden pt-20 pb-20">
        <div className="relative max-w-7xl mx-auto px-4 md:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center md:min-h-[600px]">
            {/* Left: Simplified Copy */}
            <motion.div
              className="space-y-6"
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.1 }}
            >
              <div>
                <h1 className="font-hero text-5xl md:text-6xl font-bold text-white leading-tight mb-3">
                  Automate Your Loan Processing
                  <br />
                  <span className="text-blue-300">in Less Than 10 Minutes.</span>
                </h1>
                <p className="text-2xl text-white font-semibold mt-4">
                  Stop Hiring Processors. Start Growing Your Margins.
                </p>
              </div>

              {/* CTA */}
              <div className="flex gap-4 pt-4 flex-col sm:flex-row">
                <Link href="/register">
                  <Button size="lg" className="bg-blue hover:bg-blue/90 text-white w-full sm:w-auto">
                    Start Free Trial
                  </Button>
                </Link>
                <Button
                  size="lg"
                  variant="outline"
                  className="text-white border-white/30 hover:border-white/60 w-full sm:w-auto"
                  onClick={() => {
                    const el = document.getElementById('how-it-works');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  Schedule Demo
                </Button>
              </div>
            </motion.div>

            {/* Right: Video Placeholder */}
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <div className="relative bg-navy/30 border border-blue/30 rounded-2xl overflow-hidden">
                <div className="aspect-video bg-gradient-to-br from-blue/20 to-navy/40 flex items-center justify-center">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-900/50 to-navy/80 flex items-center justify-center">
                    <Play className="w-16 h-16 text-white fill-white/80" />
                  </div>
                </div>
              </div>

              {/* Stats below video */}
              <div className="mt-8 grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-white">200+</div>
                  <div className="text-sm text-white/60">Lending Teams</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">$50M+</div>
                  <div className="text-sm text-white/60">Processed</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">99.9%</div>
                  <div className="text-sm text-white/60">Uptime</div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ===== SOCIAL PROOF (Early) ===== */}
      <section className="py-12 bg-[#0F1729]">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center space-y-6"
          >
            {/* Testimonial Block */}
            <div className="max-w-2xl mx-auto bg-white/5 border border-white/10 rounded-lg p-6">
              <p className="text-white/80 italic mb-4">
                "Lendry cut our document processing time from 4 hours to 2 minutes per loan. Our team went from processing 50 loans/month to 500. We haven't hired anyone. Our margins improved 23%."
              </p>
              <p className="font-semibold text-white">Mike Chen, VP Operations</p>
              <p className="text-sm text-white/60">Midwest Community Bank, Des Moines</p>
            </div>

            {/* Security Badges */}
            <div className="flex flex-wrap items-center justify-center gap-6 pt-4">
              {[
                { icon: '🔒', label: 'SOC2 Type II' },
                { icon: '🛡️', label: 'Bank-Grade Security' },
                { icon: '✅', label: 'Zero Training' },
              ].map((badge, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 px-3 py-2 bg-white/10 rounded-full border border-white/10"
                >
                  <span>{badge.icon}</span>
                  <span className="text-sm font-medium text-white/80">{badge.label}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ===== THE PROBLEM (Dark Section) ===== */}
      <section className="py-24 lg:py-32 bg-[#0F1729]">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl font-display font-bold text-white mb-4">
              Why Most Lenders Stay Stuck
            </h2>
            <p className="text-lg text-gray-300 max-w-3xl mx-auto">
              The core problem isn't your people. It's the process. Here's what's holding you back.
            </p>
          </motion.div>

          {/* 4 Problem Cards — Bento Grid */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 gap-5"
          >
            <motion.div variants={itemVariants} className="md:row-span-2">
              <div className="h-full bg-gradient-to-br from-[#1a2744] to-[#1E293B] rounded-3xl p-8 flex flex-col">
                <AlertCircle className="w-8 h-8 text-red-400 mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">{problemCards[0].title}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{problemCards[0].description}</p>
                <div className="flex-1 min-h-[120px]" />
              </div>
            </motion.div>
            <motion.div variants={itemVariants}>
              <div className="h-full bg-gradient-to-br from-blue-900/40 to-[#1a2744] rounded-3xl p-8">
                <TrendingDown className="w-8 h-8 text-red-400 mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">{problemCards[1].title}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{problemCards[1].description}</p>
              </div>
            </motion.div>
            <motion.div variants={itemVariants}>
              <div className="h-full bg-gradient-to-br from-[#1E293B] to-[#162040] rounded-3xl p-8">
                <Clock className="w-8 h-8 text-red-400 mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">{problemCards[2].title}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{problemCards[2].description}</p>
              </div>
            </motion.div>
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="mt-5"
          >
            <motion.div variants={itemVariants}>
              <div className="bg-gradient-to-r from-[#162040] to-[#1a2744] rounded-3xl p-8">
                <AlertCircle className="w-8 h-8 text-red-400 mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">{problemCards[3].title}</h3>
                <p className="text-white/60 text-sm leading-relaxed max-w-2xl">{problemCards[3].description}</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ===== BENEFIT CARDS (Redesigned) ===== */}
      <section className="py-24 lg:py-32 bg-[#0F1729]">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <p className="text-sm font-semibold text-blue-400 tracking-wide uppercase mb-3">
              The Solution
            </p>
            <h2 className="text-4xl lg:text-5xl font-display font-bold text-white mb-4">
              Three Pillars. One Platform.
            </h2>
            <p className="text-lg text-white/60 max-w-3xl mx-auto">
              Lendry handles the three things that are killing your margins: document processing, borrower communication, and automation setup.
            </p>
          </motion.div>

          {/* Benefit Cards — Bento Grid */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 gap-5"
          >
            <motion.div variants={itemVariants} className="md:row-span-2">
              <div className="h-full bg-gradient-to-br from-blue-600/20 to-[#1a2744] rounded-3xl p-8 flex flex-col">
                <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4">
                  <FileText className="w-6 h-6 text-blue-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{benefitCards[0].title}</h3>
                <p className="text-white/60 leading-relaxed">{benefitCards[0].description}</p>
                <div className="flex-1 min-h-[120px]" />
              </div>
            </motion.div>
            <motion.div variants={itemVariants}>
              <div className="h-full bg-gradient-to-br from-purple-900/30 to-[#1E293B] rounded-3xl p-8">
                <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center mb-4">
                  <Zap className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{benefitCards[1].title}</h3>
                <p className="text-white/60 leading-relaxed">{benefitCards[1].description}</p>
              </div>
            </motion.div>
            <motion.div variants={itemVariants}>
              <div className="h-full bg-gradient-to-br from-[#1E293B] to-[#1a2744] rounded-3xl p-8">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-4">
                  <Target className="w-6 h-6 text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{benefitCards[2].title}</h3>
                <p className="text-white/60 leading-relaxed">{benefitCards[2].description}</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ===== SCALABILITY (Before/After) ===== */}
      <section className="py-24 lg:py-32 bg-[#0F1729]">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl font-display font-bold text-white mb-4">
              Handle 100 Loans or 10,000. Same Effort.
            </h2>
            <p className="text-lg text-gray-300 max-w-3xl mx-auto">
              One loan or one hundred applicants per day—Lendry runs your programs identically. No slowdown. No scaling your team. Your rules scale, your costs don't.
            </p>
          </motion.div>

          {/* Before/After Comparison */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto"
          >
            {/* Before */}
            <div className="bg-gradient-to-br from-red-900/20 to-[#1E293B] rounded-3xl p-8">
              <h3 className="text-xl font-bold text-white mb-6">Without Lendry</h3>
              <div className="space-y-4">
                {[
                  { icon: '❌', text: '1 person = 50 loans/month' },
                  { icon: '❌', text: 'Manual doc review: 4 hrs per 10 docs' },
                  { icon: '❌', text: '10 borrower emails/day per officer' },
                  { icon: '❌', text: 'Setup: 3-6 months' },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <span className="text-xl">{item.icon}</span>
                    <p className="text-white/60">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* After */}
            <div className="bg-gradient-to-br from-emerald-900/20 to-[#1a2744] rounded-3xl p-8">
              <h3 className="text-xl font-bold text-white mb-6">With Lendry</h3>
              <div className="space-y-4">
                {[
                  { icon: '✅', text: '1 person = 500 loans/month (10x)' },
                  { icon: '✅', text: 'Auto doc scan: 2 min per doc' },
                  { icon: '✅', text: '1 borrower email/day (automatic)' },
                  { icon: '✅', text: 'Setup: 5 minutes' },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <span className="text-xl">{item.icon}</span>
                    <p className="text-white/60">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ===== HOW IT WORKS (3 Steps) ===== */}
      <section className="py-24 lg:py-32 bg-[#0F1729]" id="how-it-works">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <p className="text-sm font-semibold text-blue-400 tracking-wide uppercase mb-3">
              Quick Setup
            </p>
            <h2 className="text-4xl lg:text-5xl font-display font-bold text-white mb-4">
              Three Simple Steps
            </h2>
            <p className="text-lg text-white/60 max-w-3xl mx-auto">
              From connection to closing, Lendry fits into your workflow without disruption.
            </p>
          </motion.div>

          {/* 3 Steps — Bento Grid */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 gap-5"
          >
            <motion.div variants={itemVariants} className="md:row-span-2">
              <div className="h-full bg-gradient-to-br from-blue-600/20 to-[#162040] rounded-3xl p-8 flex flex-col">
                <div className="text-4xl font-bold text-blue-400 mb-4">{howItWorks[0].number}</div>
                <h3 className="text-2xl font-bold text-white mb-3">{howItWorks[0].title}</h3>
                <p className="text-white/60 leading-relaxed">{howItWorks[0].description}</p>
                <div className="flex-1 min-h-[120px]" />
              </div>
            </motion.div>
            <motion.div variants={itemVariants}>
              <div className="h-full bg-gradient-to-br from-[#1a2744] to-[#1E293B] rounded-3xl p-8">
                <div className="text-4xl font-bold text-blue-400 mb-4">{howItWorks[1].number}</div>
                <h3 className="text-2xl font-bold text-white mb-3">{howItWorks[1].title}</h3>
                <p className="text-white/60 leading-relaxed">{howItWorks[1].description}</p>
              </div>
            </motion.div>
            <motion.div variants={itemVariants}>
              <div className="h-full bg-gradient-to-br from-[#1E293B] to-[#1a2744] rounded-3xl p-8">
                <div className="text-4xl font-bold text-blue-400 mb-4">{howItWorks[2].number}</div>
                <h3 className="text-2xl font-bold text-white mb-3">{howItWorks[2].title}</h3>
                <p className="text-white/60 leading-relaxed">{howItWorks[2].description}</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ===== TRUST SECTION ===== */}
      <section className="py-12 bg-[#0F1729]">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            <div className="bg-blue-500/10 border border-blue-400/30 rounded-lg p-6">
              <p className="text-white/80 font-medium">
                <span className="font-semibold">Bank-grade security.</span> SOC2 Type II certified. Your loan programs, your data, your control. No vendor lock-in. Compliant with all lending regulations.
              </p>
            </div>

            <div className="mt-6">
              <Link href="/how-we-compare">
                <p className="text-blue-400 hover:text-blue-300 font-semibold cursor-pointer">
                  See How Lendry Compares to the Big Guys →
                </p>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="py-32 lg:py-40 bg-[#0F1729]">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="space-y-8"
          >
            <div>
              <h2 className="text-4xl lg:text-5xl font-display font-bold text-white mb-4">
                Like Hiring Unlimited 24/7 Loan Processors
              </h2>
              <p className="text-xl text-blue-300 font-semibold mb-2">
                In 5 Minutes. For a Fraction of the Cost of One.
              </p>
              <p className="text-lg text-gray-300">
                No credit card required. No training needed. Start processing more deals today.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register">
                <Button size="lg" className="bg-blue hover:bg-blue/90 text-white w-full sm:w-auto">
                  Start Free Trial
                </Button>
              </Link>
              <Button
                size="lg"
                variant="outline"
                className="text-white border-white/30 hover:border-white/60 w-full sm:w-auto"
                onClick={() => {
                  const el = document.getElementById('how-it-works');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Schedule a Demo
              </Button>
            </div>

            <p className="text-sm text-gray-400">
              Join 200+ lending teams already automating their operations.
            </p>
          </motion.div>
        </div>
      </section>
    </PublicLayout>
  );
}
