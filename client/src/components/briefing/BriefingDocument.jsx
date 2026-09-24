import BriefingSection from "./BriefingSection";

const SECTION_ORDER = [
  "executive_summary",
  "incidents",
  "recommendations",
  "anomalies",
  "follow_up",
];

// Skeleton placeholder for one section
function SectionSkeleton() {
  return (
    <div className="animate-pulse py-8 px-8 border-b border-border">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-5 h-5 rounded-sm bg-surface-3"></div>
        <div className="h-4 w-48 bg-surface-3 rounded-sm"></div>
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full bg-surface-3 rounded-sm"></div>
        <div className="h-3 w-5/6 bg-surface-3 rounded-sm"></div>
        <div className="h-3 w-4/6 bg-surface-3 rounded-sm"></div>
      </div>
    </div>
  );
}

export default function BriefingDocument({ briefing, isApproved }) {
  const typographyClass = 'text-base leading-7';

  return (
    <>
      {/* Print head — invisible on screen */}
      <div className="hidden print:block print:mb-6 print:pb-4 print:border-b print:border-black">
        <h1 className="text-2xl font-bold text-black">Sentinel — Morning Operations Briefing</h1>
        <p className="text-sm text-gray-600 mt-1">{new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
      </div>

      <article
        className={`bg-surface-2 min-h-full divide-y divide-border print:bg-white print:divide-gray-200 ${typographyClass}`}
      >
        {briefing === null ? (
          SECTION_ORDER.map((key) => <SectionSkeleton key={key} />)
        ) : (
          <>
            {SECTION_ORDER.map((key) => {
              const raw = briefing.sections?.[key];
              const agentDraft = typeof raw === "string" ? raw : raw?.agentDraft || "";
              return (
              <BriefingSection
                key={key}
                sectionName={key}
                sectionData={{ agentDraft, mayaVersion: null, isEdited: false }}
                briefingId={briefing.id}
                isApproved={isApproved}
              />
            );
            })}
            {Array.isArray(briefing.ragSources) && briefing.ragSources.length > 0 && (
              <div
                style={{
                  padding: "16px 32px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-xs)",
                  color: "var(--fg-3)",
                  letterSpacing: "0.04em",
                }}
              >
                <span style={{ textTransform: "uppercase", marginRight: "8px", color: "var(--fg-4)" }}>
                  Argus referenced:
                </span>
                {briefing.ragSources.join(" · ")}
              </div>
            )}
          </>
        )}
      </article>

      {/* Global print stylesheet injected via style tag */}
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          body { background: white !important; color: black !important; }
          article { background: white !important; }
          button, [role="button"] { display: none !important; }
        }
      `}</style>
    </>
  );
}
