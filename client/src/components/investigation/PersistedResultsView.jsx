"use client";

import AgentReasoning from "@/components/incident/AgentReasoning";
import EvidenceChain from "@/components/incident/EvidenceChain";
import styles from "./investigation.module.css";

/**
 * Merge what the incident read and the evidence-graph read each know about the
 * stored investigation. Either document proves results exist; the graph is the
 * richer one when present.
 */
export function deriveInvestigationResults({ incident, graph }) {
  const investigation = incident?.investigationId ?? null;
  const classification = {
    ...(graph?.classification || {}),
    ...(investigation?.classification || {}),
  };
  const reasoning =
    classification.reasoning || incident?.agentSummary || null;
  const steps = graph?.steps || [];

  return {
    hasResults: Boolean(
      investigation?.status === "complete" ||
        reasoning ||
        steps.length ||
        graph?.classification,
    ),
    classification,
    reasoning,
    confidence: classification.confidence ?? 0,
    uncertainties: classification.uncertainties || [],
    steps,
    resultSource: graph?.resultSource || investigation?.resultSource || null,
    executiveSummary: graph?.executiveSummary || investigation?.executiveSummary || null,
    findings: graph?.findings || investigation?.findings || [],
    recommendedActions: graph?.recommendedActions || investigation?.recommendedActions || [],
    dataLimitations: graph?.dataLimitations || investigation?.dataLimitations || [],
  };
}

function Section({ index, title, note, children }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionIndex}>{index}</span>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {note && <span className={styles.provenance}>{note}</span>}
      </div>
      {children}
    </section>
  );
}

/** Read-only view of a finished investigation for the selected incident. */
export default function PersistedResultsView({ results, isLoading }) {
  if (isLoading) {
    return <div className={styles.loading}>Loading Argus investigation results…</div>;
  }

  const {
    classification,
    reasoning,
    confidence,
    uncertainties,
    steps,
    resultSource,
    executiveSummary,
    findings,
    recommendedActions,
    dataLimitations,
  } = results;

  // Keep the section indices contiguous when the optional block is absent.
  const hasExtras =
    findings.length > 0 || recommendedActions.length > 0 || dataLimitations.length > 0;

  return (
    <div className={styles.results}>
      <Section
        index="01"
        title="Executive Summary"
        note={
          resultSource && (
            <span
              className={
                resultSource === "llm" ? styles.provenanceLlm : styles.provenanceFallback
              }
            >
              Result provenance: {resultSource}
            </span>
          )
        }
      >
        <p className={styles.summary}>
          {executiveSummary || "No executive summary was recorded for this investigation."}
        </p>
      </Section>

      <Section index="02" title="Agent Reasoning">
        <AgentReasoning reasoning={reasoning || "No reasoning recorded."} uncertainties={uncertainties} confidence={confidence} />
      </Section>

      {hasExtras && (
        <Section index="03" title="Findings & Limitations">
          {findings.length > 0 && (
            <>
              <div className={styles.provenance}>Findings</div>
              <ul className={styles.bodyList}>
                {findings.map((finding, index) => (
                  <li key={index} className={styles.bodyText}>{finding.detail || finding}</li>
                ))}
              </ul>
            </>
          )}
          {recommendedActions.length > 0 && (
            <>
              <div className={styles.provenance}>Recommended actions</div>
              <ul className={styles.bodyList}>
                {recommendedActions.map((action, index) => (
                  <li key={index} className={styles.bodyText}>• {action}</li>
                ))}
              </ul>
            </>
          )}
          {dataLimitations.length > 0 && (
            <>
              <div className={styles.provenance}>Data limitations</div>
              <ul className={styles.bodyList}>
                {dataLimitations.map((limitation, index) => (
                  <li key={index} className={styles.bodyText}>• {limitation}</li>
                ))}
              </ul>
            </>
          )}
        </Section>
      )}

      <Section index={hasExtras ? "04" : "03"} title="Evidence Chain">
        <EvidenceChain steps={steps} classification={classification} />
      </Section>
    </div>
  );
}
