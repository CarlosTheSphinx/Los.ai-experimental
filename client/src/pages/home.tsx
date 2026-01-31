import { useState, useEffect } from "react";
import { LoanForm } from "@/components/LoanForm";
import { PricingResult } from "@/components/PricingResult";
import { usePricing } from "@/hooks/use-pricing";
import { type LoanPricingFormData, type PricingResponse } from "@shared/schema";
import { motion, AnimatePresence } from "framer-motion";
import sphinxLogo from "@assets/Sphinx_Capital_Logo_-_Blue_-_No_Background_(1)_1769811166428.jpeg";
import { Progress } from "@/components/ui/progress";

const progressSteps = [
  { percent: 10, message: "Initializing pricing engine..." },
  { percent: 25, message: "Ron is racing down the hall to collect quotes..." },
  { percent: 45, message: "Terry is texting Tom to solidify the rate..." },
  { percent: 65, message: "Analyzing lender network availability..." },
  { percent: 85, message: "Finalizing your custom quote..." },
  { percent: 95, message: "Almost there! Just a few more seconds..." },
];

export default function Home() {
  const [result, setResult] = useState<PricingResponse | null>(null);
  const [lastFormData, setLastFormData] = useState<LoanPricingFormData | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  
  const { mutate: getPricing, isPending } = usePricing();

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPending) {
      setProgress(0);
      let stepIdx = 0;
      setProgressMessage(progressSteps[0].message);
      
      interval = setInterval(() => {
        setProgress((prev) => {
          const next = prev + (100 / 30); // Reach 100% in about 30s roughly, or until it finishes
          if (next >= 100) return 99;
          
          // Update message based on progress
          const currentStep = progressSteps.findLast(step => next >= step.percent);
          if (currentStep) setProgressMessage(currentStep.message);
          
          return next;
        });
      }, 1000);
    } else {
      setProgress(0);
      setProgressMessage("");
    }
    return () => clearInterval(interval);
  }, [isPending]);

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
              className="h-16 w-auto object-contain"
            />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <AnimatePresence mode="wait">
          {isPending ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6 text-center py-20"
            >
              <div className="max-w-md mx-auto space-y-4">
                <Progress value={progress} className="h-3 w-full" />
                <p className="text-lg font-medium text-slate-700 animate-pulse">
                  {progressMessage}
                </p>
              </div>
            </motion.div>
          ) : !result ? (
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
