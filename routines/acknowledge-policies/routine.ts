// A form a person completes for themselves (Open Autonomy seam `onboarding`: the policy acknowledgment, the code of
// conduct …; runhuman-2 ADR 0038 §12): Evidence Desk files a run with the form's questions and, for an acknowledgment,
// the version and hash of every policy in force; the person answers each question in one Task. Evidence Desk grades the
// answers when it collects them, as it grades any response.
import { routine } from "@runhuman/routine";

type Question = { id: string; prompt: string; type: string; options?: string[] };

export default routine({
  form: {
    person: { required: true, type: "string" },
    form: { required: true, type: "string" },
    title: { required: true, type: "string" },
    intro: { type: "string" },
    questions: { items: { fields: { id: { required: true, type: "string" }, options: { items: { type: "string" }, type: "array" }, prompt: { required: true, type: "string" }, type: { required: true, type: "string" } }, type: "object" }, required: true, type: "array" },
    policies: { items: { fields: { id: { required: true, type: "string" }, sha256: { required: true, type: "string" }, version: { required: true, type: "integer" } }, type: "object" }, type: "array" },
  },
  // Each question's answer, in the form's order (a form's questions are its own, so the run returns them as a list).
  returns: { items: { fields: { answer: { required: true, type: "string" }, id: { required: true, type: "string" } }, type: "object" }, required: true, type: "array" },
  title: "Complete a form",
}, [
  async function open(run) {
    run.state.room = await run.room();
  },
  async function ask(run) {
    const room = run.state.room as Parameters<typeof run.ask>[0];
    const questions = run.vars.questions as Question[];
    const policies = (run.vars.policies ?? []) as { id: string; version: number; sha256: string }[];
    const choices = (q: Question): string[] | undefined => q.type === "choice" ? q.options ?? [] : q.type === "yes-no" || q.type === "attest" ? ["yes", "no"] : undefined;
    const fields = Object.fromEntries(questions.map((q) => { const options = choices(q); return [q.id, { required: true, type: "string" as const, ...(options ? { enum: options } : {}) }]; }));
    run.state.task = await run.ask(room, {
      ask: {
        instructions: [String(run.vars.intro ?? ""), ...questions.map((q) => `${q.id}: ${q.prompt}${q.options ? ` (${q.options.join(" / ")})` : ""}`),
          ...(policies.length ? ["", "The policies in force:", ...policies.map((p) => `- ${p.id} version ${p.version} (sha256 ${p.sha256})`)] : [])].join("\n").trim(),
        title: String(run.vars.title),
      },
      fields: { form: run.vars.form, policies: policies as never },
      form: { form: { required: true, type: "string" }, policies: { items: { fields: { id: { required: true, type: "string" }, sha256: { required: true, type: "string" }, version: { required: true, type: "integer" } }, type: "object" }, type: "array" } },
      key: "form",
      returns: { fields, required: true, type: "object" },
      who: { principal: String(run.vars.person) },
    });
  },
  async function answer(run) {
    const state = await run.until(run.state.task as Parameters<typeof run.until>[0], "answered");
    const answers = state.answer as Record<string, string>;
    return run.close((run.vars.questions as Question[]).map((q) => ({ answer: String(answers[q.id] ?? ""), id: q.id })));
  },
]);
