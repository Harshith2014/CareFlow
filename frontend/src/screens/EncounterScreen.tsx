import { Check, ShieldCheck, Sparkles } from "lucide-react";
import { api, labels } from "../api";
import type { Auth, Draft, Encounter, Note } from "../api";
import { Badge, Field } from "../components";

interface Props {
  auth: Auth;
  encounter: Encounter;
  rough: string;
  review: Note;
  draft: Draft | null;
  busy: boolean;
  dirty: boolean;
  locked: boolean;
  setRough: (v: string) => void;
  setReview: (v: Note) => void;
  setDraft: (d: Draft | null) => void;
  setEncounter: (e: Encounter) => void;
  run: (work: () => Promise<void>, success?: string) => Promise<void>;
  refresh: () => Promise<void>;
  saveNote: () => Promise<Encounter | null>;
}

export default function EncounterScreen({
  auth,
  encounter,
  rough,
  review,
  draft,
  busy,
  dirty,
  locked,
  setRough,
  setReview,
  setDraft,
  setEncounter,
  run,
  refresh,
  saveNote,
}: Props) {
  return (
    <>
      <section className="encounter-banner">
        <div>
          <Badge>{encounter.status}</Badge>
          <span>
            Version {encounter.version} {dirty && "· Unsaved changes"}
          </span>
        </div>
        <span>
          {locked
            ? "Finalized record · Amendments are outside this demo"
            : "Only the assigned doctor can edit this encounter"}
        </span>
      </section>
      <div className="editor-grid">
        <section className="panel form-panel">
          <div className="panel-heading">
            <h2>Original rough note</h2>
            <Badge>Source</Badge>
          </div>
          <p className="muted">
            Fictional information only.{" "}
            {auth.ai_mode === "mock"
              ? "This demonstration parser maps Concern:, History:, Observations:, and Plan: labels. Unlabeled notes are copied into Reported concern and need manual organization."
              : auth.ai_mode === "live"
                ? "Ordinary rough notes are accepted; section labels are optional. Review every generated field against your source."
                : "AI is disabled. Save your source and organize the reviewed fields manually."}
          </p>
          <Field label="Rough encounter note">
            <textarea
              className="rough-note"
              maxLength={8000}
              value={rough}
              disabled={locked || busy}
              onChange={(e) => setRough(e.target.value)}
              placeholder={
                "Concern: Fictional patient reports a mild cough.\nHistory: Started yesterday.\nObservations: No measurements documented.\nPlan: Follow-up discussed."
              }
            />
          </Field>
          <small className="muted">{rough.length} / 8000 characters</small>
          <div className="actions">
            <button
              className="primary"
              disabled={busy || locked || !dirty}
              onClick={() =>
                void run(async () => {
                  await saveNote();
                }, "Encounter saved.")
              }
            >
              Save notes
            </button>
            <button
              className="secondary"
              disabled={
                busy || locked || !rough.trim() || auth.ai_mode === "disabled"
              }
              title={
                auth.ai_mode === "disabled"
                  ? "AI disabled; write the reviewed note manually"
                  : "Save changes and generate a separate draft"
              }
              onClick={() =>
                void run(async () => {
                  const e = dirty ? await saveNote() : encounter;
                  if (!e) return;
                  const d = await api<Draft>(
                    `/encounters/${e.id}/generate`,
                    "POST",
                    { version: e.version },
                  );
                  setDraft(d);
                  if (d.status !== "succeeded")
                    throw new Error(
                      d.error ??
                        "This response is stale. Reload and generate again.",
                    );
                })
              }
            >
              <Sparkles size={16} />
              Generate draft
            </button>
          </div>
          <div className="notice">
            {auth.ai_mode === "mock"
              ? "Mock mode: deterministic label parsing, not model inference."
              : `${auth.ai_mode} mode: generated output requires human review.`}{" "}
            AI does not finalize or overwrite your original note.
          </div>
        </section>
        <section className="panel form-panel">
          <div className="panel-heading">
            <h2>Doctor-reviewed documentation</h2>
            <ShieldCheck size={21} />
          </div>
          <p className="muted">
            Verify against the source. Prompt rules and schema validation cannot
            guarantee factual correctness.
          </p>
          {draft && (
            <div className="draft-preview">
              <strong>Generated draft · {draft.status}</strong>
              <small>
                {draft.model} · Source version {draft.source_version}
              </small>
              {draft.output &&
                Object.entries(labels).map(([key, label]) => (
                  <div key={key}>
                    <strong>{label}</strong>
                    <p>{draft.output?.[key as keyof Note]}</p>
                  </div>
                ))}
              {draft.status === "succeeded" && (
                <button
                  className="secondary"
                  disabled={locked || busy}
                  onClick={() => {
                    if (draft.output) setReview(draft.output);
                  }}
                >
                  Use draft for review
                </button>
              )}
            </div>
          )}
          {Object.entries(labels).map(([key, label]) => (
            <Field key={key} label={label}>
              <textarea
                value={review[key as keyof Note]}
                disabled={locked || busy}
                maxLength={8000}
                onChange={(e) =>
                  setReview({ ...review, [key]: e.target.value })
                }
              />
            </Field>
          ))}
          <button
            className="primary wide"
            disabled={busy || locked || dirty}
            title={
              dirty
                ? "Save your edits before finalizing"
                : "Finalization makes the encounter immutable"
            }
            onClick={() => {
              if (
                confirm(
                  "I have reviewed this documentation against the source. Finalize permanently and complete the appointment?",
                )
              )
                void run(async () => {
                  const e = await api<Encounter>(
                    `/encounters/${encounter.id}/finalize`,
                    "POST",
                    { version: encounter.version },
                  );
                  setEncounter(e);
                  await refresh();
                }, "Encounter finalized and appointment completed.");
            }}
          >
            <Check size={17} />
            {locked ? "Finalized" : "Finalize reviewed encounter"}
          </button>
          {dirty && <p className="muted">Save notes before finalizing.</p>}
          <button
            className="text-button"
            onClick={() => {
              if (!dirty || confirm("Discard unsaved edits and reload?"))
                void run(async () => {
                  const e = await api<Encounter>(`/encounters/${encounter.id}`);
                  setEncounter(e);
                  setRough(e.rough_note);
                  setReview(e.reviewed_note);
                  setDraft(null);
                });
            }}
          >
            Reload saved encounter
          </button>
        </section>
      </div>
    </>
  );
}
