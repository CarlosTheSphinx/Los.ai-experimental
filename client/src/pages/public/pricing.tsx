import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PublicLayout } from "@/components/PublicLayout";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Check, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6 },
  },
};

export default function PublicPricingPage() {
  const tiers = [
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
      cta: "Get Started",
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
      cta: "Get Started",
      highlighted: true,
    },
    {
      name: "Enterprise",
      price: "Custom",
      period: "pricing",
      description: "Scale your lending operations with full control",
      features: [
        "White-label options",
        "API access",
        "SSO & Security suite",
        "Dedicated account manager",
        "Custom integrations",
      ],
      cta: "Contact Sales",
      highlighted: false,
    },
  ];

  const faqs = [
    {
      question: "Can I change plans anytime?",
      answer:
        "Yes, you can upgrade or downgrade your plan at any time. Changes take effect at the start of your next billing cycle.",
    },
    {
      question: "What happens if I exceed my loan volume?",
      answer:
        "We'll notify you when you're approaching your limit. You can easily upgrade to the next tier to increase your capacity.",
    },
    {
      question: "Do you offer annual pricing?",
      answer:
        "Yes, we offer a 15% discount for annual billing on all plans. Contact our sales team to learn more.",
    },
    {
      question: "Is there a free trial?",
      answer:
        "Absolutely! We offer a 14-day free trial for all new accounts. No credit card required.",
    },
    {
      question: "What support is included?",
      answer:
        "All plans include onboarding support. Starter includes email support, Professional includes priority support, and Enterprise includes a dedicated account manager.",
    },
    {
      question: "Can you integrate with my existing systems?",
      answer:
        "Yes, we offer integrations with most major lending and banking platforms. Professional and Enterprise tiers include API access for custom integrations.",
    },
  ];

  return (
    <PublicLayout>
      {/* Hero Section */}
      <section className="py-24 lg:py-32 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-4 mb-12"
          >
            <h1 className="text-4xl lg:text-5xl font-bold tracking-tight">
              Transparent Pricing
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Choose the plan that fits your volume.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Pricing Tiers */}
      <section className="py-24 lg:py-32 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={{
              visible: {
                transition: {
                  staggerChildren: 0.1,
                },
              },
            }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-6"
          >
            {tiers.map((tier, idx) => (
              <motion.div key={idx} variants={itemVariants}>
                <Card
                  className={`p-8 h-full flex flex-col relative bg-white ${
                    tier.highlighted ? "ring-2 ring-blue-500 shadow-lg" : ""
                  }`}
                >
                  <div className="mb-8">
                    <h3 className="text-2xl font-bold mb-2">{tier.name}</h3>
                    <p className="text-sm text-muted-foreground mb-6">
                      {tier.description}
                    </p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-5xl font-bold">{tier.price}</span>
                      <span className="text-sm text-muted-foreground">
                        {tier.period}
                      </span>
                    </div>
                  </div>

                  <ul className="space-y-3 mb-8 flex-1">
                    {tier.features.map((feature, featureIdx) => (
                      <li key={featureIdx} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link href="/contact">
                    <Button className="w-full bg-slate-900 hover:bg-slate-800 text-white" size="lg">
                      {tier.cta}
                    </Button>
                  </Link>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 lg:py-32 bg-card">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold tracking-tight mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-muted-foreground">
              Have questions? We're here to help.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true }}
          >
            <Accordion type="single" collapsible className="space-y-4">
              {faqs.map((faq, idx) => (
                <AccordionItem key={idx} value={`item-${idx}`}>
                  <AccordionTrigger className="hover:text-primary">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 lg:py-32 bg-background">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="space-y-8"
          >
            <div>
              <h2 className="text-4xl font-bold tracking-tight mb-4">
                Ready to get started?
              </h2>
              <p className="text-xl text-muted-foreground">
                Start your 14-day free trial today. No credit card required.
              </p>
            </div>

            <Link href="/contact">
              <Button size="lg" className="bg-primary hover:bg-primary/90">
                Get Started Now
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>
    </PublicLayout>
  );
}
