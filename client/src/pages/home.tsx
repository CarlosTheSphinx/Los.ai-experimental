import { useState, useEffect } from "react";
import { LoanForm } from "@/components/LoanForm";
import { PricingResult } from "@/components/PricingResult";
import { usePricing } from "@/hooks/use-pricing";
import { type LoanPricingFormData, type PricingResponse } from "@shared/schema";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { Calculator } from "lucide-react";

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
          const next = prev + (100 / 30);
          if (next >= 100) return 99;
          
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
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    });
  };

  const handleReset = () => {
    setResult(null);
  };

  return (
    <div className="min-h-screen">
      <header className="bg-white/80 backdrop-blur-md border-b border-primary/10 sticky top-0 z-40">
        <div className="px-6 py-4">
          <div className="flex items-center gap-3">
            <Calculator className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold text-primary">New Quote</h1>
              <p className="text-sm text-slate-500">Generate loan pricing</p>
            </div>
          </div>
        </div>
      </header>

      <div className="p-6">
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
              <LoanForm 
                onSubmit={handleSubmit} 
                isLoading={isPending} 
                defaultData={lastFormData}
              />
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
      </div>
    </div>
  );
}
