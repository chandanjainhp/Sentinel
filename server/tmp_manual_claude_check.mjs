import "dotenv/config";
import { connectDatabases, disconnectDatabases } from "./src/db/index.js";
import Incident from "./src/models/incident.model.js";
import Investigation from "./src/models/investigation.model.js";
import { runInvestigation } from "./src/ai/agent.js";

await connectDatabases();
try {
  const incident = await Incident.findOne().sort({ createdAt: -1 });
  if (!incident) {
    console.log("NO_INCIDENT_FOUND");
    process.exit(0);
  }
  console.log("MANUAL_INCIDENT_ID", incident._id.toString());

  const investigation = await Investigation.create({
    incidentId: incident._id,
    nightDate: incident.nightDate,
    status: "queued",
    toolCallSequence: [],
    evidenceChain: [],
    classification: {
      severity: "uncertain",
      confidence: 0,
      reasoning: "Manual run pending",
      uncertainties: [],
    },
  });

  const emitProgress = async () => {};
  await runInvestigation(
    incident._id.toString(),
    investigation._id.toString(),
    emitProgress,
    investigation,
  );
} finally {
  await disconnectDatabases();
}
