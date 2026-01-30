import { useState } from "react";
import { LoanForm } from "@/components/LoanForm";
import { PricingResult } from "@/components/PricingResult";
import { usePricing } from "@/hooks/use-pricing";
import { type LoanPricingFormData, type PricingResponse } from "@shared/schema";
import { motion, AnimatePresence } from "framer-motion";
import sphinxLogo from "@assets/Sphinx_Capital_Logo_-_Blue_-_No_Background_(1)_1769811166428.jpeg";

export default function Home() {
  const [result, setResult] = useState<PricingResponse | null>(null);
  const [lastFormData, setLastFormData] = useState<LoanPricingFormData | null>(null);
  
  const { mutate: getPricing, isPending } = usePricing();

  const handleSubmit = (data: LoanPricingFormData) => {
    setLastFormData(data);
    getPricing(data, {
      onSuccess: (response) => {
        setResult(response);
        // Scroll to top to show result nicely on mobile
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    });
  };

  const handleReset = () => {
    setResult(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 font-sans pb-20">
      {/* Header Section */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary rounded-lg p-1.5">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-display font-bold text-slate-900 tracking-tight">
              Rate<span className="text-primary">Master</span>
            </h1>
          </div>
          <div>
            <img 
              src={sphinxLogo} 
              alt="Sphinx Capital" 
              className="h-12 w-auto object-contain"
            />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="text-center mb-10 space-y-2">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-slate-900">
            Get Your Custom Rate Quote
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Enter your loan scenario below to receive real-time pricing from our comprehensive lender network.
          </p>
        </div>

        <AnimatePresence mode="wait">
          {!result ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <LoanForm onSubmit={handleSubmit} isLoading={isPending} />
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <PricingResult 
                result={result} 
                formData={lastFormData} 
                onReset={handleReset} 
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
