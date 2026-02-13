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
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0F1729] pt-20">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 w-full">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            transition={{ staggerChildren: 0.15, delayChildren: 0.3 }}
            className="space-y-8 text-center items-center flex flex-col"
          >
            {/* Hero Headline */}
            <motion.div variants={itemVariants}>
              <h1 className="text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight text-white leading-tight">
                The World's First Loan
                <br />
                <span className="line-through decoration-blue-500 decoration-4">
                  Origination
                </span>
                {" "}Automation System
              </h1>
            </motion.div>

            {/* Subtitle */}
            <motion.p
              variants={itemVariants}
              className="text-lg lg:text-xl text-gray-300 max-w-2xl"
            >
              Lendry.AI automates origination and processing so lending teams can move deals forward with clarity, speed, and control.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              variants={itemVariants}
              className="flex flex-col sm:flex-row gap-4 pt-4"
            >
              <Button
                size="lg"
                variant="outline"
                className="border-white text-white hover:bg-white/10 px-8"
              >
                See how Lendry.AI works &gt;
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white text-white hover:bg-white/10 px-8"
              >
                Request access
              </Button>
            </motion.div>

            {/* Trust Line */}
            <motion.p
              variants={itemVariants}
              className="text-sm text-gray-500 tracking-widest uppercase pt-4"
            >
              Built specifically for brokers, processors, and lenders.
            </motion.p>

            {/* Deal Pipeline Mockup */}
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.0, delay: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
              viewport={{ once: true }}
              className="mt-12 rounded-lg bg-[#1E293B] p-8 border border-gray-700 will-change-transform"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-white font-semibold text-sm">Deal Pipeline</h3>
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  New Deal
                </Button>
              </div>

              {/* Kanban Board Mockup */}
              <div className="grid grid-cols-4 gap-4">
                {/* INTAKE Column */}
                <div>
                  <div className="text-gray-400 text-xs font-semibold mb-3 tracking-wide">
                    INTAKE <span className="text-gray-600">(4)</span>
                  </div>
                  <div className="space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={`intake-${i}`}
                        className="bg-gray-700/50 rounded p-3 text-gray-300 text-xs"
                      >
                        <div className="font-medium mb-1">Deal #{i}</div>
                        <div className="text-gray-500">Client Name</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* DOCS Column */}
                <div>
                  <div className="text-gray-400 text-xs font-semibold mb-3 tracking-wide">
                    DOCS <span className="text-gray-600">(3)</span>
                  </div>
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={`docs-${i}`}
                        className="bg-gray-700/50 rounded p-3 text-gray-300 text-xs"
                      >
                        <div className="font-medium mb-1">Deal #{i + 10}</div>
                        <div className="text-gray-500">Client Name</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CONDITIONS Column */}
                <div>
                  <div className="text-gray-400 text-xs font-semibold mb-3 tracking-wide">
                    CONDITIONS <span className="text-gray-600">(2)</span>
                  </div>
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <div
                        key={`conditions-${i}`}
                        className="bg-gray-700/50 rounded p-3 text-gray-300 text-xs"
                      >
                        <div className="font-medium mb-1">Deal #{i + 20}</div>
                        <div className="text-gray-500">Client Name</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CLEAR TO CLOSE Column */}
                <div>
                  <div className="text-gray-400 text-xs font-semibold mb-3 tracking-wide">
                    CLEAR TO CLOSE <span className="text-gray-600">(1)</span>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-gray-700/50 rounded p-3 text-gray-300 text-xs">
                      <div className="font-medium mb-1">Deal #30</div>
                      <div className="text-gray-500">Client Name</div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
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
      <section className="py-24 lg:py-32 bg-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
            viewport={{ once: true }}
            className="text-center mb-16 will-change-transform"
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
              <motion.div key={idx} variants={itemVariants} className="will-change-transform">
                <Card
                  className={`p-8 h-full flex flex-col ${
                    plan.highlighted
                      ? "bg-white border-2 border-blue-500 shadow-lg"
                      : "bg-white"
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
                  <p className="text-gray-600 mb-8">
                    {plan.description}
                  </p>

                  <div className="space-y-4 mb-8 flex-grow">
                    {plan.features.map((feature, featureIdx) => (
                      <div
                        key={featureIdx}
                        className="flex items-start gap-3"
                      >
                        <Check className="w-5 h-5 text-gray-900 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-700">{feature}</span>
                      </div>
                    ))}
                  </div>

                  <Button
                    size="lg"
                    className={`w-full ${
                      plan.name === "Enterprise"
                        ? "bg-gray-900 hover:bg-gray-800 text-white"
                        : "bg-gray-900 hover:bg-gray-800 text-white"
                    }`}
                  >
                    {plan.name === "Enterprise" ? "Contact Sales" : "Get Started"}
                  </Button>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-24 lg:py-32 bg-[#0F1729]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
            viewport={{ once: true }}
            className="space-y-8 will-change-transform"
          >
            <div>
              <h2 className="text-4xl lg:text-5xl font-bold tracking-tight text-white mb-4">
                Ready to automate your lending?
              </h2>
              <p className="text-lg text-gray-300">
                Join leading brokers, processors, and lenders who are moving deals faster with Lendry.AI.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button
                size="lg"
                className="bg-white text-gray-900 hover:bg-gray-100 px-8"
              >
                Start your free trial
              </Button>
            </div>
          </motion.div>
        </div>
      </section>
    </PublicLayout>
  );
}
