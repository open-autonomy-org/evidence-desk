// A policy approved by the person who owns it (Open Autonomy seam `policy-approval`, runhuman-2 ADR 0038 §12): Evidence
// Desk files a run with the policy's exact text and its hash; the person reads it in a Task and answers. The Task keeps
// the hash it showed, so the approval Evidence Desk collects is of exactly that text.
import { routine } from "@runhuman/routine";

export default routine({
  form: {
    person: { required: true, type: "string" },
    policy: { required: true, type: "string" },
    title: { required: true, type: "string" },
    text: { required: true, type: "string" },
    sha256: { required: true, type: "string" },
  },
  returns: { fields: { approved: { required: true, type: "boolean" }, sha256: { required: true, type: "string" } }, required: true, type: "object" },
  title: "Approve a policy",
}, [
  async function open(run) {
    run.state.room = await run.room();
  },
  async function ask(run) {
    const room = run.state.room as Parameters<typeof run.ask>[0];
    run.state.task = await run.ask(room, {
      ask: {
        instructions: `${String(run.vars.text)}\n\n---\nApprove this text of ${String(run.vars.title)} as true of how the organization operates (sha256 ${String(run.vars.sha256)}), or decline it and say what is wrong in a question.`,
        title: `Approve: ${String(run.vars.title)}`,
      },
      fields: { policy: run.vars.policy, sha256: run.vars.sha256 },
      key: "approval",
      returns: { required: true, type: "boolean" },
      who: { principal: String(run.vars.person) },
    });
  },
  async function answer(run) {
    const state = await run.until(run.state.task as Parameters<typeof run.until>[0], "answered");
    return run.close({ approved: state.answer === true, sha256: String(run.vars.sha256) });
  },
]);
