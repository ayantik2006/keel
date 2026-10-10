"use client";

import { useId, useState } from "react";
import Select from "../dashboard/Select";
import { inputClass, primaryButton } from "../dashboard/SettingsUI";

const TOPICS = [
  { value: "support", label: "Support" },
  { value: "security", label: "Security and compliance" },
  { value: "other", label: "Something else" },
] as const;

type Topic = (typeof TOPICS)[number]["value"];

const FORMAS_URL = "https://www.formas.space/api/submit";
const FORMAS_API_KEY = process.env.NEXT_PUBLIC_FORMAS_API_KEY;

const label = "block text-[13px] font-medium";
const MESSAGE_MAX = 4000;

export default function ContactForm() {
  const id = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [topic, setTopic] = useState<Topic>("support");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return setError("Enter a valid email address.");
    if (message.trim().length < 10)
      return setError("Tell us a little more. Messages need at least 10 characters.");

    // Filled only by bots. Pretend it worked and send nothing.
    if (website) return setSent(true);

    if (!FORMAS_API_KEY)
      return setError("The contact form is not available right now.");

    setBusy(true);
    try {
      const res = await fetch(`${FORMAS_URL}/${FORMAS_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          company: company.trim(),
          topic: TOPICS.find((t) => t.value === topic)?.label ?? topic,
          message: message.trim(),
        }),
      });
      if (!res.ok) throw new Error("Could not send your message. Try again.");
      setSent(true);
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Could not reach the server. Check your connection."
          : err instanceof Error
            ? err.message
            : "Could not send your message. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div
        role="status"
        className="animate-view-in border border-border bg-surface px-6 py-12 text-center motion-reduce:animate-none"
      >
        <span className="mx-auto flex h-10 w-10 items-center justify-center bg-accent-soft text-accent">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m5 12 5 5L20 7" />
          </svg>
        </span>
        <h2 className="mt-5 text-[20px] font-semibold tracking-tight">
          Message sent
        </h2>
        <p className="mx-auto mt-2 max-w-xs text-[14px] leading-relaxed text-muted">
          Thanks, {name.trim().split(" ")[0]}. We will reply to {email.trim()}.
        </p>
        <button
          onClick={() => {
            setSent(false);
            setMessage("");
          }}
          className="mt-6 text-[13px] font-medium text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="relative border border-border bg-surface"
    >
      <div className="border-b border-border px-6 py-5">
        <h2 className="text-[16px] font-semibold tracking-tight">
          Send a message
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          Fields marked with an asterisk are required.
        </p>
      </div>

      <div className="space-y-5 px-6 py-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-name`} className={label}>
              Name <span className="text-accent">*</span>
            </label>
            <input
              id={`${id}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              maxLength={100}
              className={`${inputClass} mt-1.5`}
            />
          </div>
          <div>
            <label htmlFor={`${id}-email`} className={label}>
              Work email <span className="text-accent">*</span>
            </label>
            <input
              id={`${id}-email`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              maxLength={254}
              className={`${inputClass} mt-1.5`}
            />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-company`} className={label}>
              Company
            </label>
            <input
              id={`${id}-company`}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              autoComplete="organization"
              maxLength={100}
              className={`${inputClass} mt-1.5`}
            />
          </div>
          <div>
            <label htmlFor={`${id}-topic`} className={label}>
              Topic
            </label>
            <Select
              id={`${id}-topic`}
              value={topic}
              onChange={setTopic}
              options={TOPICS}
              className="mt-1.5 w-full"
            />
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor={`${id}-message`} className={label}>
              Message <span className="text-accent">*</span>
            </label>
            <span className="text-[12px] text-muted">
              {message.length}/{MESSAGE_MAX}
            </span>
          </div>
          <textarea
            id={`${id}-message`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={MESSAGE_MAX}
            rows={6}
            className={`${inputClass} mt-1.5 resize-y`}
          />
        </div>

        {/* Honeypot: hidden from people and assistive tech, bots fill it in. */}
        <div
          aria-hidden="true"
          className="absolute -left-[9999px] h-0 w-0 overflow-hidden"
        >
          <label>
            Website
            <input
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>
        </div>

        {error && (
          <p role="alert" className="text-[13px] text-red-600">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border bg-code/40 px-6 py-4">
        <p className="text-[12px] text-muted">
          We only use your details to reply to you.
        </p>
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? "Sending..." : "Send message"}
        </button>
      </div>
    </form>
  );
}
