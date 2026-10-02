// A policy approved by the person who owns it (Open Autonomy seam `policy-approval`, runhuman-2 ADR 0038 §12): Evidence
// Desk files a run with the policy's exact text and its hash; the person reads it in a Task and answers. The Task keeps
// the hash it showed, so the approval Evidence Desk collects is of exactly that text.
//
// Where the person takes part is this code's (RFC 0017 §9): reached in Slack (`reach`, their profile link), the run's
// Conversation is linked to their direct messages through the channel bridge, and Runhuman's companion relays the line
// they type there, with it as their consent. A person Runhuman does not know yet (no `person`) is asked whoever answers
// in those messages: their act is theirs once their Volter sign-in is consolidated with the Slack person they wrote as.
import { RUNHUMAN_COMPANION, TASK_ROLES, routine, type RunRoom, type RunTask } from "@runhuman/routine";

const role = (key: string) => TASK_ROLES.find((each) => each.key === key)!;

export default routine({
  form: {
    person: { type: "string" },
    reach: { type: "url" },
    policy: { required: true, type: "string" },
    title: { required: true, type: "string" },
    text: { required: true, type: "string" },
    sha256: { required: true, type: "string" },
  },
  returns: { fields: { approved: { required: true, type: "boolean" }, sha256: { required: true, type: "string" } }, required: true, type: "object" },
  title: "Approve a policy",
}, [
  async function open(run) {
    const reach = run.vars.reach === undefined ? undefined : String(run.vars.reach);
    run.state.room = await run.room({
      conversations: [{ authority: "collaboration", key: "work", name: "Approve a policy", ...(reach ? { backing: { link: { label: "Direct messages", url: reach } } } : {}) }],
      name: `Approve: ${String(run.vars.title)}`.slice(0, 120),
      roles: [role("operator"), { actions: ["room.read", "surfaces.view"], conversationKeys: ["work"], key: "member", name: "Member" }, role("companion")],
    });
  },
  async function ask(run) {
    const room = run.state.room as RunRoom;
    run.state.task = await run.ask(room, {
      ask: {
        instructions: `${String(run.vars.text)}\n\n---\nApprove this text of ${String(run.vars.title)} as true of how the organization operates (sha256 ${String(run.vars.sha256)}): answer approve, or decline and say what is wrong.`,
        title: `Approve: ${String(run.vars.title)}`,
      },
      fields: { policy: run.vars.policy, sha256: run.vars.sha256 },
      form: { policy: { required: true, type: "string" }, sha256: { required: true, type: "string" } },
      key: "approval",
      returns: { enum: ["approve", "decline"], required: true, type: "string" },
      ...(run.vars.person === undefined ? {} : { who: { principal: String(run.vars.person) } }),
    });
  },
  async function companion(run) {
    // In their direct messages the person types; the companion relays their answer, their own line its consent.
    if (run.vars.reach === undefined) return;
    await run.agent(run.state.room as RunRoom, {
      answers: "all", follows: run.state.task as RunTask, harness: RUNHUMAN_COMPANION.run.harness, instructions: RUNHUMAN_COMPANION.instructions!,
      key: "companion", model: RUNHUMAN_COMPANION.run.model, name: RUNHUMAN_COMPANION.name!, role: "companion",
    });
  },
  async function answer(run) {
    const state = await run.until(run.state.task as RunTask, "answered");
    return run.close({ approved: state.answer === "approve", sha256: String(run.vars.sha256) });
  },
]);
