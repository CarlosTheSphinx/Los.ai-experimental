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
      icon: Database,
      title: "One system of record",
      description: "Everything related to a deal, from intake to funding, lives in Lendry.AI. No more chasing updates across email, spreadsheets, and shared drives.",
    },
    {
      icon: Target,
      title: "Clear next steps",
      description: "Instantly see what's blocked, what's moving, and what needs attention. Every deal has a clear status and a clear path forward.",
    },
    {
      icon: Building2,
      title: "Built for lending teams",
      description: "Designed specifically for brokers, processors, and lenders — not retrofitted from a generic CRM.",
    },
  ];

  const howItWorks = [
    {
      number: "01",
      title: "Capture deals once. Use them everywhere.",
      description: "Enter deal information once, and it automatically flows through your documents, pricing calculations, and task management.",
      position: "left",
    },
    {
      number: "02",
      title: "One Click Processing",
      description: "Trigger document checklists, borrower requests, and condition tracking with a single click from your dashboard.",
      position: "right",
    },
    {
      number: "03",
      title: "Clarity at every stage of the deal",
      description: "See your entire deal pipeline at a glance. Know exactly where each deal stands and what needs attention.",
      position: "left",
    },
    {
      number: "04",
      title: "Everything in one place. Always current.",
      description: "Documents, notes, communications, and deal history all live in Lendry.AI. No more scattered information.",
      position: "right",
    },
    {
      number: "05",
      title: "Built to scale with your team",
      description: "Multi-user collaboration with role-based access controls. Your entire team works better together.",
      position: "left",
    },
  ];

  const pricingPlans = [
    {
      name: "Starter",
      price: "$199",
      period: "/mo",
      description: "Ideal for individual brokers and small teams",
      features: [
        "Up to 10 active deals",
        "Standard automation rules",
        "Document collection",
        "Email support",
      ],
      highlighted: false,
    },
    {
      name: "Professional",
      price: "$499",
      period: "/mo",
      description: "Built for high-volume processing teams",
      features: [
        "Unlimited active deals",
        "Custom automation workflows",
        "Advanced condition tracking",
        "Priority support",
        "Team collaboration tools",
      ],
      highlighted: true,
    },
    {
      name: "Enterprise",
      price: "Custom",
      period: "",
      description: "Scale your lending operations with full control",
      features: [
        "White-label options",
        "API access",
        "SSO & Security suite",
        "Dedicated account manager",
        "Custom integrations",
      ],
      highlighted: false,
    },
  ];

  return (
    <PublicLayout>
      {/* Hero Section - Cinematic & Vast */}
      <section className="relative h-screen w-full flex items-center justify-center overflow-hidden">
        {/* Gradient Background with Radial Glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0F2438] via-[#1A3A52] to-[#0F1729]" />
        <div className="absolute inset-0 bg-radial from-blue-500/10 via-transparent to-transparent" style={{
          backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.1) 0%, transparent 70%)'
        }} />

        {/* Subtle animated background elements */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl animate-pulse opacity-20" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl animate-pulse opacity-20" style={{ animationDelay: '1s' }} />

        {/* Content */}
        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center w-full">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="space-y-8"
          >
            {/* Hero Headline - Massive & Punchy */}
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1 }}
              className="font-bold text-white leading-tight tracking-tight" style={{ fontSize: 'clamp(2rem, 5vw, 4.5rem)' }}
            >
              The World's First
              <br />
              <span className="whitespace-nowrap">Loan{" "}
              <span className="relative inline-block">
                Origination
                <span className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ transform: 'rotate(-8deg)' }}>
                  <span className="block w-full" style={{ height: '10px', background: 'rgba(59, 130, 246, 0.85)', borderRadius: '3px' }}></span>
                </span>
              </span>
              {" "}Automation System</span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto"
            >
              Lendry.AI automates origination and processing so lending teams can move deals forward with clarity, speed, and control.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4 justify-center pt-4"
            >
              <Button
                size="lg"
                variant="outline"
                className="text-white border-white/30 hover:border-white/60"
                onClick={() => {
                  const el = document.getElementById('how-it-works');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                See how Lendry.AI works &gt;
              </Button>
              <Link href="/register">
                <Button size="lg" variant="outline" className="text-white border-white/30 hover:border-white/60">
                  Request access
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>

        {/* Scroll Indicator Chevron */}
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-20"
        >
          <ChevronDown className="w-6 h-6 text-white/50 hover:text-white/80 transition-colors" />
        </motion.div>
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
              Trusted by leading lenders
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true }}
            className="flex flex-wrap items-center justify-center gap-8 md:gap-12"
          >
            {['Partner 1', 'Partner 2', 'Partner 3', 'Partner 4', 'Partner 5'].map((partner, idx) => (
              <div
                key={idx}
                className="text-gray-400 text-sm font-medium opacity-50 hover:opacity-100 transition-opacity"
              >
                {partner}
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* AI Suite Features Section */}
      <section className="py-24 lg:py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <p className="text-sm font-semibold text-blue-600 tracking-wide uppercase mb-3">
              AI Suite
            </p>
            <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 mb-4">
              Powered by intelligent automation
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              Three branded AI capabilities working together to move deals faster.
            </p>
          </motion.div>

          {/* Branded Features Grid */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16"
          >
            {[
              {
                icon: FileText,
                title: 'Smart Review',
                subtitle: 'Document Review',
                tagline: 'AI reads every document so you don\'t have to',
                description: 'Automatically analyze and extract key information from loan documents, saving hours of manual review.'
              },
              {
                icon: Zap,
                title: 'Your Assistant',
                subtitle: 'AI Processor',
                tagline: 'Your smartest processor, always on call',
                description: 'Intelligent processing that learns your workflow and automates repetitive tasks with precision.'
              },
              {
                icon: Search,
                title: 'Smart Prospect',
                subtitle: 'AI Outreach',
                tagline: 'Finds your next deal before you do',
                description: 'Proactively identify opportunities and match them to your lending programs automatically.'
              },
            ].map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <motion.div key={idx} variants={itemVariants}>
                  <Card className="h-full p-8 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mb-6">
                      <Icon className="w-6 h-6 text-blue-600" />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-1">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-gray-500 font-medium mb-3">
                      {feature.subtitle}
                    </p>
                    <p className="text-gray-700 italic text-sm mb-4">
                      "{feature.tagline}"
                    </p>
                    <p className="text-gray-600">
                      {feature.description}
                    </p>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Generic Features Grid */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 pt-8 border-t border-gray-200"
          >
            {[
              'One-Click Processing',
              'Daily Digest',
              'Rate Comparison',
              'Program Templates',
              'AI Review Rules'
            ].map((feature, idx) => (
              <div key={idx} className="py-4 px-3 text-center">
                <p className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors">
                  {feature}
                </p>
              </div>
            ))}
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
            <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 mb-4">
              Built for the way lending actually works
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              Most lending teams don't need more software — they need software that actually fits. Lendry.AI replaces the spreadsheets, shared drives, and scattered tools slowing your team down.
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
              How Lendry.AI Works
            </p>
            <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-gray-900">
              From intake to close, automated.
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
              Transparent Pricing
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Choose the plan that fits your volume.
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
                Ready to automate lending?
              </h2>
              <p className="text-lg text-gray-300">
                Join leading brokers, processors, and lenders who are moving deals faster with Lendry.AI.
              </p>
            </div>

            <div className="flex justify-center">
              <Link href="/register" className="text-xl text-white/90 hover:text-white border-b border-transparent hover:border-white/50 transition-all duration-300 pb-1 font-medium">
                  Get Started
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </PublicLayout>
  );
}
