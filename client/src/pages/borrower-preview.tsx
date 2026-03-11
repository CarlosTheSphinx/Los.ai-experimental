import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Eye, ArrowLeft, Home, FileText, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BorrowerDashboard } from "@/components/BorrowerDashboard";

export default function BorrowerPreview() {
  return (
    <div className="min-h-screen">
      <div className="bg-blue-600/10 border-b border-blue-600/20 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-600/15 border border-blue-600/25">
            <Eye className="h-3.5 w-3.5 text-blue-600" />
            <span className="text-[13px] font-semibold text-blue-600 uppercase tracking-wider">Preview Mode</span>
          </div>
          <span className="text-[14px] text-blue-600/80">
            This is what your borrowers will see when they log in to their dashboard.
          </span>
        </div>
      </div>
      <BorrowerDashboard />
    </div>
  );
}
