"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Loader2, ChevronRight } from "lucide-react";
import { useApproveBriefing } from "@/hooks/useBriefing";
import { formatTime } from "@/lib/formatters";

export default function ApproveButton({ briefingId, canApprove, isApproved, approvedAt }) {
  const [showDialog, setShowDialog] = useState(false);
  const { mutate: approve, isPending } = useApproveBriefing();

  const handleConfirm = () => {
    approve(briefingId);
    setShowDialog(false);
  };

  return (
    <>
      <AnimatePresence mode="wait">
        {isApproved ? (
          <motion.div
            key="approved"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-end gap-1"
          >
            <div className="flex items-center gap-2 text-severity-harmless font-mono text-sm uppercase tracking-widest">
              <CheckCircle2 className="w-5 h-5" />
              Briefing Approved
              {approvedAt && <span className="text-text-muted text-xs">at {formatTime(approvedAt)}</span>}
            </div>
            <span className="font-mono text-[10px] text-text-muted uppercase tracking-widest">Ready for 8:00 AM review</span>
          </motion.div>
        ) : canApprove ? (
          <motion.button
            key="can-approve"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={() => setShowDialog(true)}
            disabled={isPending}
            style={{ background: "var(--sev-minor)", color: "var(--bg-base)", boxShadow: "var(--glow-minor)" }}
            className="relative flex items-center gap-2 font-mono text-sm font-bold uppercase tracking-widest px-6 py-4 rounded-sm transition-colors disabled:opacity-60 print:hidden animate-pulse"
          >
            {isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Approving...</>
            ) : (
              <>Approve Briefing for 8:00 AM <ChevronRight className="w-4 h-4" /></>
            )}
          </motion.button>
        ) : (
          <motion.div
            key="cannot-approve"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="group relative print:hidden"
          >
            <button
              disabled
              className="flex items-center gap-2 bg-surface-3 border border-border text-text-muted font-mono text-sm uppercase tracking-widest px-6 py-3 rounded-sm cursor-not-allowed"
            >
              Approve Briefing
            </button>
            <div className="absolute bottom-full right-0 mb-2 w-64 bg-surface border border-border px-3 py-2 font-mono text-[10px] text-text-secondary uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 text-right">
              Complete the investigation and review all escalations first
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Dialog — rendered as inline overlay */}
      <AnimatePresence>
        {showDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-9999 flex items-center justify-center bg-black/70 backdrop-blur-sm print:hidden"
            onClick={(e) => { if (e.target === e.currentTarget) setShowDialog(false); }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="bg-surface-2 border border-border rounded-sm max-w-md w-full mx-4 overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-border">
                <h3 className="text-white text-lg font-bold mb-2">Approve this briefing?</h3>
                <p className="text-text-secondary text-sm leading-relaxed">
                  This will lock the briefing for the 8:00 AM review with Nisha. You can still print or share it after approval.
                </p>
              </div>

              <div className="flex justify-end gap-4 px-6 py-4">
                <button
                  onClick={() => setShowDialog(false)}
                  className="font-mono text-[10px] uppercase tracking-widest text-text-muted hover:text-white px-4 py-2 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  style={{ background: "var(--sev-minor)", color: "var(--bg-base)" }}
                  className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest px-6 py-2 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" /> Approve
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
