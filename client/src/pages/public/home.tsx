import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PublicLayout } from "@/components/PublicLayout";
import {
  Database,
  Target,
  Building2,
  Plus,
  Check,
  ChevronDown,
  FileText,
  Zap,
  Search,
  TrendingUp,
  EyeOff,
  Link2,
  Bot,
  Eye,
  BarChart3,
  Shield,
  Play,
} from "lucide-react";
import { motion } from "framer-motion";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: [0.25, 0.1, 0.25, 1] },
  },
};

export default function PublicHomePage() {
  const features = [
    {
      icon: FileText,
      title: "Smart Document Review",
      description: "AI reads documents 100x faster than humans. Automatically extracts key data, flags risks, and verifies compliance.",
    },
    {
      icon: Zap,
      title: "AI Assistant",
      description: "Natural language interface. Ask questions about loans, get instant answers. No training required.",
    },
    {
      icon: Target,
      title: "Smart Prospect Scoring",
      description: "ML models predict loan quality before processing. Focus on high-probability deals first.",
    },
  ];

  const howItWorks = [
    {
      number: "01",
      title: "Connect",
      description: "Connect your existing CRM and loan management systems. Lendry.AI integrates with your current stack in minutes, not weeks.",
      position: "left",
    },
    {
      number: "02",
      title: "Configure",
      description: "Define your processing rules and approval criteria. Set up your loan programs, credit policies, and automation workflows.",
      position: "right",
    },
    {
      number: "03",
      title: "Automate",
      description: "AI agents take over loan processing. Document review, data extraction, compliance checks — all running 24/7 without manual intervention.",
      position: "left",
    },
    {
      number: "04",
      title: "Communicate",
      description: "Borrowers receive automatic updates via Magic Links. They see exactly where their application stands — no more phone calls asking for status.",
      position: "right",
    },
    {
      number: "05",
      title: "Close",
      description: "Deals move from intake to funded faster. Your team processes 3x more volume with the same headcount. Revenue grows, overhead doesn't.",
      position: "left",
    },
  ];

  const pricingPlans = [
    {
      name: "Broker",
      price: "$299",
      period: "/mo",
      description: "For individual brokers getting started",
      features: [
        "Up to 10 active loans",
        "Up to 3 users",
        "All 3 AI Agents",
        "E-Signatures",
      ],
      highlighted: false,
    },
    {
      name: "Originator",
      price: "$999",
      period: "/mo",
      description: "For growing lending teams ready to scale",
      features: [
        "Up to 50 active loans",
        "Unlimited users",
        "All 3 AI Agents",
        "Cloud Storage Sync",
        "Advanced reporting",
      ],
      highlighted: true,
    },
    {
      name: "Correspondent",
      price: "$1,799",
      period: "/mo",
      description: "For high-volume operations",
      features: [
        "Up to 100 active loans",
        "Unlimited users",
        "Custom Integrations",
        "Custom Development",
      ],
      highlighted: false,
    },
  ];

  return (
    <PublicLayout>
      {/* Hero Section - Two Column Grid */}
      <section className="relative bg-gradient-to-br from-navy via-blue/5 to-background overflow-hidden">
        <div className="relative pt-20 pb-20 px-4 md:px-8 max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center md:min-h-screen md:py-20">

            {/* Left: Copy */}
            <motion.div
              className="space-y-8"
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.1 }}
            >
              {/* Main Headline - SPECIFIC */}
              <div>
                <h1 className="font-hero text-5xl md:text-6xl font-bold text-white leading-tight mb-4">
                  Automate Your Entire Loan Pipeline
                </h1>

                {/* Badge */}
                <div className="inline-block bg-blue/20 border border-blue/50 rounded-full px-4 py-2 mb-6 mt-4">
                  <span className="text-sm text-blue-300 font-medium">
                    The World's First Loan Automation System
                  </span>
                </div>
              </div>

              {/* Subheadline - CAPABILITY-SPECIFIC */}
              <motion.p
                className="text-xl text-foreground/80 leading-relaxed"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
              >
                <span className="font-semibold">Document Review</span> →
                <span className="font-semibold"> Borrower Communication</span> →
                <span className="font-semibold"> Deal Tracking</span>
                <br />
                All automated. No integrations. One platform.
              </motion.p>

              {/* Support Copy - TRUST + SPECIFICITY */}
              <motion.div
                className="flex items-center gap-3 text-sm text-foreground/70"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.25 }}
              >
                <Shield className="w-5 h-5 text-emerald flex-shrink-0" />
                <span>SOC2 Type II • Bank-Grade Security • Zero Training on Your Data</span>
              </motion.div>

              {/* CTA */}
              <motion.div
                className="flex gap-4 pt-4 flex-col sm:flex-row"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.3 }}
              >
                <Link href="/register">
                  <Button size="lg" className="bg-blue hover:bg-blue/90 text-white w-full sm:w-auto">
                    Start Free Trial
                  </Button>
                </Link>
                <Button
                  size="lg"
                  variant="outline"
                  className="text-foreground border-foreground/30 hover:border-foreground/60 w-full sm:w-auto"
                  onClick={() => {
                    const el = document.getElementById('how-it-works');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  Schedule Demo
                </Button>
              </motion.div>
            </motion.div>

            {/* Right: Video Demo */}
            <motion.div
              className="relative"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              {/* Video Container - Aspect Ratio 16:9 */}
              <div className="relative bg-navy/30 border border-blue/30 rounded-2xl overflow-hidden">
                <div className="aspect-video bg-gradient-to-br from-blue/20 to-navy/40 flex items-center justify-center group cursor-pointer">

                  {/* Placeholder for video - will be replaced with actual video */}
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-900/50 to-navy/80 flex items-center justify-center">
                    <Play className="w-16 h-16 text-white fill-white/80 group-hover:fill-white transition-all" />
                  </div>
                </div>

                {/* Gradient border effect */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue/20 via-emerald/10 to-blue/20 pointer-events-none" />
              </div>

              {/* Trust Indicators Below Video */}
              <div className="mt-8 grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-white">200+</div>
                  <div className="text-sm text-foreground/60">Lending Teams</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">$50M+</div>
                  <div className="text-sm text-foreground/60">Processed</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">99.9%</div>
                  <div className="text-sm text-foreground/60">Uptime</div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Trusted By Section */}
      <section className="py-16 bg-gradient-to-b from-[#0F1729] to-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <p className="text-gray-600 text-sm font-medium tracking-widest uppercase">
              Trusted by 200+ lending teams
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true }}
            className="flex flex-wrap items-center justify-center gap-6 md:gap-10"
          >
            {[
              { icon: '🔒', label: 'SOC2 Type II' },
              { icon: '🛡️', label: 'SSL Encrypted' },
              { icon: '🏦', label: 'Bank-Grade Security' },
            ].map((badge, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-gray-200 shadow-sm"
              >
                <span>{badge.icon}</span>
                <span className="text-gray-700 text-sm font-medium">{badge.label}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* The Lending Scale Problem Section */}
      <section className="py-24 lg:py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 mb-4">
              The Lending Scale Problem
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              Sound familiar? You're not alone. Most lenders face the same squeeze.
            </p>
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            {[
              {
                icon: TrendingUp,
                title: 'More Deals = More Hires',
                description: 'Every new loan means hiring another processor. Your overhead grows faster than revenue.',
              },
              {
                icon: EyeOff,
                title: 'Borrowers Left in the Dark',
                description: "Manual processes mean radio silence. Borrowers can't track progress, leading to dropped deals.",
              },
              {
                icon: Link2,
                title: 'Scattered Tools Slow You Down',
                description: "Juggling 5+ platforms. Data doesn't sync. Time wasted copying and pasting between systems.",
              },
            ].map((problem, idx) => {
              const Icon = problem.icon;
              return (
                <motion.div key={idx} variants={itemVariants}>
                  <Card className="h-full p-8 border border-gray-200 shadow-sm hover:shadow-md transition-shadow bg-gray-50">
                    <div className="w-12 h-12 rounded-lg bg-red-100 flex items-center justify-center mb-6">
                      <Icon className="w-6 h-6 text-red-500" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-3">
                      {problem.title}
                    </h3>
                    <p className="text-gray-600">
                      {problem.description}
                    </p>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* Three Pillars — Solution Section */}
      <section className="py-24 lg:py-32 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 mb-4">
              Built to Scale Your Lending Business
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              Three pillars. One platform. Infinite growth.
            </p>
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            {[
              {
                icon: Bot,
                title: 'Automate Processing',
                description: 'AI agents handle 80% of loan processing tasks. Document review, data extraction, compliance checks — all automated 24/7.',
              },
              {
                icon: Eye,
                title: 'Borrower Visibility',
                description: 'Magic links give borrowers real-time updates. They see exactly where their application stands, reducing phone calls by 60%.',
              },
              {
                icon: BarChart3,
                title: 'Scale Without Hiring',
                description: 'Your team processes 3x more loans. No new hires needed. Same people, 10x productivity through intelligent automation.',
              },
            ].map((pillar, idx) => {
              const Icon = pillar.icon;
              return (
                <motion.div key={idx} variants={itemVariants}>
                  <Card className="h-full p-8 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mb-6">
                      <Icon className="w-6 h-6 text-blue-600" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-3">
                      {pillar.title}
                    </h3>
                    <p className="text-gray-600">
                      {pillar.description}
                    </p>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* Built for the way lending works Section */}
      <section className="py-24 lg:py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
            viewport={{ once: true }}
            className="text-center mb-16 will-change-transform"
          >
            <p className="text-sm font-semibold text-blue-600 tracking-wide uppercase mb-3">
              Intelligent Automation at Work
            </p>
            <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 mb-4">
              Purpose-Built Features for Lending Teams
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              Three branded AI capabilities working together to move deals faster.
            </p>
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            {features.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <motion.div key={idx} variants={itemVariants} className="will-change-transform">
                  <div className="h-full">
                    <div className="flex flex-col h-full">
                      <div className="w-14 h-14 rounded-lg bg-[#1E293B] flex items-center justify-center mb-4">
                        <Icon className="w-7 h-7 text-white" />
                      </div>
                      <h3 className="text-xl font-semibold text-gray-900 mb-3">
                        {feature.title}
                      </h3>
                      <p className="text-gray-600">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* How Lendry.AI Works Section */}
      <section className="py-24 lg:py-32 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
            viewport={{ once: true }}
            className="text-center mb-16 will-change-transform"
          >
            <p className="text-sm font-semibold text-blue-600 tracking-wide uppercase mb-2">
              How It Works
            </p>
            <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-gray-900">
              From setup to automation in minutes
            </h2>
          </motion.div>

          <div className="space-y-16">
            {howItWorks.map((step, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
                viewport={{ once: true }}
                className="will-change-transform"
              >
                <div
                  className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center ${
                    step.position === "right" ? "lg:grid-flow-col-dense" : ""
                  }`}
                >
                  {/* Text Content */}
                  <div
                    className={
                      step.position === "right" ? "lg:col-start-2" : ""
                    }
                  >
                    <div className="text-6xl lg:text-7xl font-bold text-gray-400 mb-4">
                      {step.number}
                    </div>
                    <h3 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-4">
                      {step.title}
                    </h3>
                    <p className="text-lg text-gray-600 leading-relaxed">
                      {step.description}
                    </p>
                  </div>

                  {/* Mockup */}
                  <div
                    className={
                      step.position === "right" ? "lg:col-start-1 lg:row-start-1" : ""
                    }
                  >
                    <div className="bg-[#1E293B] rounded-lg p-8 min-h-96 flex items-center justify-center">
                      {idx === 0 && (
                        <div className="w-full space-y-4">
                          <div className="text-white text-sm font-semibold mb-4">Form: Borrower Information</div>
                          <div className="space-y-3">
                            <div className="bg-gray-700/50 rounded p-3 text-gray-400 text-sm">
                              Name: John Smith
                            </div>
                            <div className="bg-gray-700/50 rounded p-3 text-gray-400 text-sm">
                              Loan Amount: $500,000
                            </div>
                            <div className="bg-gray-700/50 rounded p-3 text-gray-400 text-sm">
                              Property Type: Single Family
                            </div>
                          </div>
                          <div className="mt-6 bg-green-900/30 border border-green-700 rounded p-4 text-green-400 text-sm">
                            ✓ Deal card created
                          </div>
                        </div>
                      )}
                      {idx === 1 && (
                        <div className="w-full space-y-4">
                          <div className="text-white text-sm font-semibold mb-4">Processing Checklist</div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-3 text-green-400 text-sm">
                              <Check className="w-4 h-4" />
                              <span>Verify Income</span>
                            </div>
                            <div className="flex items-center gap-3 text-yellow-400 text-sm">
                              <div className="w-4 h-4 rounded-full border-2 border-yellow-400 flex items-center justify-center text-xs">⟳</div>
                              <span>Property Appraisal</span>
                            </div>
                            <div className="flex items-center gap-3 text-gray-400 text-sm">
                              <div className="w-4 h-4 rounded-full border-2 border-gray-400"></div>
                              <span>Title Report</span>
                            </div>
                          </div>
                        </div>
                      )}
                      {idx === 2 && (
                        <div className="w-full">
                          <div className="text-white text-sm font-semibold mb-4">Deal Pipeline Status</div>
                          <div className="flex gap-3 overflow-x-auto">
                            {["INTAKE", "DOCS", "CONDITIONS", "CLEAR"].map((col) => (
                              <div key={col} className="min-w-24">
                                <div className="text-gray-400 text-xs font-semibold mb-2">{col}</div>
                                <div className="bg-gray-700/50 rounded p-2 text-gray-500 text-xs">Deal</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {idx === 3 && (
                        <div className="w-full space-y-4">
                          <div className="text-white text-sm font-semibold mb-4">Document & Activity View</div>
                          <div className="space-y-3">
                            <div className="bg-gray-700/50 rounded p-3">
                              <div className="text-gray-300 text-xs font-medium mb-1">Documents</div>
                              <div className="text-gray-500 text-xs">Income Verification.pdf</div>
                            </div>
                            <div className="bg-gray-700/50 rounded p-3">
                              <div className="text-gray-300 text-xs font-medium mb-1">Notes</div>
                              <div className="text-gray-500 text-xs">Awaiting appraisal update</div>
                            </div>
                          </div>
                        </div>
                      )}
                      {idx === 4 && (
                        <div className="w-full space-y-4">
                          <div className="text-white text-sm font-semibold mb-4">Team Access</div>
                          <div className="space-y-2">
                            <div className="bg-gray-700/50 rounded p-3 flex items-center justify-between">
                              <div className="text-gray-300 text-sm">Sarah - Loan Officer</div>
                              <div className="text-gray-500 text-xs bg-gray-700 rounded px-2 py-1">Full Access</div>
                            </div>
                            <div className="bg-gray-700/50 rounded p-3 flex items-center justify-between">
                              <div className="text-gray-300 text-sm">Mike - Processor</div>
                              <div className="text-gray-500 text-xs bg-gray-700 rounded px-2 py-1">Processing</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-24 lg:py-32 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 mb-4">
              Simple Pricing. Infinite Scale.
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Start free, grow without limits.
            </p>
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            {pricingPlans.map((plan, idx) => (
              <motion.div key={idx} variants={itemVariants}>
                <Card
                  className={`p-8 h-full flex flex-col shadow-sm rounded-lg border transition-all duration-300 ${
                    plan.highlighted
                      ? "bg-white border-2 border-blue-600 shadow-md scale-105 md:scale-100 md:[&]:ring-1 md:[&]:ring-blue-100"
                      : "bg-white border border-gray-200 hover:shadow-md"
                  }`}
                >
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">
                    {plan.name}
                  </h3>
                  <div className="mb-4">
                    <span className="text-5xl font-bold text-gray-900">
                      {plan.price}
                    </span>
                    <span className="text-gray-600 text-lg">{plan.period}</span>
                  </div>
                  <p className="text-gray-600 mb-8 text-sm">
                    {plan.description}
                  </p>

                  <div className="space-y-4 mb-8 flex-grow">
                    {plan.features.map((feature, featureIdx) => (
                      <div
                        key={featureIdx}
                        className="flex items-start gap-3"
                      >
                        <Check className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-700 text-sm">{feature}</span>
                      </div>
                    ))}
                  </div>

                  <Link href={plan.name === "Enterprise" ? "/contact" : "/register"}>
                    <Button
                      size="lg"
                      className={`w-full rounded-lg font-medium transition-all duration-300 ${
                        plan.highlighted
                          ? "bg-blue-600 hover:bg-blue-700 text-white"
                          : "bg-gray-100 text-gray-900 hover:bg-gray-200"
                      }`}
                    >
                      {plan.name === "Enterprise" ? "Contact Sales" : "Sign Up"}
                    </Button>
                  </Link>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="relative py-32 lg:py-40 bg-gradient-to-b from-gray-900 via-[#0F1729] to-[#0F1729] overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute inset-0 bg-radial from-blue-500/5 via-transparent to-transparent" style={{
          backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.05) 0%, transparent 70%)'
        }} />

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center z-10">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
            viewport={{ once: true }}
            className="space-y-8"
          >
            <div>
              <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-white mb-4">
                Ready to Process More Deals?
              </h2>
              <p className="text-lg text-gray-300">
                Join 200+ lending teams automating their operations. No credit card required.
              </p>
            </div>

            <div className="flex justify-center">
              <Link href="/register">
                <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white">
                  Start Your Free Trial
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </PublicLayout>
  );
}
