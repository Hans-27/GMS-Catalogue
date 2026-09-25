"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  API_ORIGIN,
  ApiError,
  downloadFeedbackExport,
  getFeedback,
  getFeedbackItem,
  getManagedUsers,
  submitFeedback,
  updateFeedback,
  type AuthenticatedUser,
  type FeedbackItem,
  type FeedbackPage,
  type FeedbackPriority,
  type FeedbackStatus,
  type FeedbackType,
  type ManagedUser,
} from "@/lib/api";
import {
  FEEDBACK_PRIORITIES,
  FEEDBACK_STATUSES,
  FEEDBACK_TYPES,
  demoOptionLabel,
} from "@/lib/demo-config";
import { T, useLanguage } from "@/lib/i18n";
import styles from "./dashboard.module.css";
import { formatApiDate } from "@/lib/date-time";

const EMPTY_FEEDBACK_PAGE: FeedbackPage = {
  items: [],
  total: 0,
  page: 1,
  page_size: 20,
  pages: 1,
};

function friendlyError(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function formatFeedbackDate(value: string, locale: string) {
  return formatApiDate(value, locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function feedbackImageUrl(path: string | null) {
  if (!path) return null;
  return path.startsWith("http") ? path : `${API_ORIGIN}${path}`;
}

type FeedbackDraft = {
  module: string;
  feedback_type: FeedbackType;
  title: string;
  description: string;
  suggested_change: string;
  priority: FeedbackPriority;
};

export function FeedbackButton({
  module,
  onSubmitted,
}: {
  module: string;
  onSubmitted?: (feedback: FeedbackItem) => void;
}) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [draft, setDraft] = useState<FeedbackDraft>({
    module,
    feedback_type: "improvement",
    title: "",
    description: "",
    suggested_change: "",
    priority: "medium",
  });

  function closeDialog() {
    if (isSubmitting) return;
    setIsOpen(false);
    setError("");
    setSuccess("");
  }

  function chooseScreenshot(file?: File) {
    setError("");
    if (!file) {
      setScreenshot(null);
      return;
    }
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowed.has(file.type)) {
      setScreenshot(null);
      setError(t("Please choose a JPEG, PNG or WebP screenshot."));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setScreenshot(null);
      setError(t("The screenshot must be 8 MB or smaller."));
      return;
    }
    setScreenshot(file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsSubmitting(true);
    try {
      const feedback = await submitFeedback({
        module_page: draft.module.trim(),
        feedback_type: draft.feedback_type,
        title: draft.title.trim(),
        description: draft.description.trim(),
        suggested_change: draft.suggested_change.trim(),
        priority: draft.priority,
        screenshot,
      });
      setSuccess(t("Thank you. Your feedback has been sent for review."));
      setDraft((current) => ({
        ...current,
        title: "",
        description: "",
        suggested_change: "",
      }));
      setScreenshot(null);
      onSubmitted?.(feedback);
    } catch (caughtError) {
      setError(
        friendlyError(
          caughtError,
          t("We could not send your feedback. Try again."),
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button
        className={styles.feedbackLauncher}
        type="button"
        onClick={() => {
          setDraft((current) => ({ ...current, module }));
          setIsOpen(true);
        }}
      >
        <span aria-hidden="true">✦</span>
        {t("Send Feedback")}
      </button>

      {isOpen && (
        <div className={styles.feedbackBackdrop} role="presentation">
          <section
            className={styles.feedbackDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-feedback-title"
          >
            <header>
              <div>
                <span>{t("Help shape this demo")}</span>
                <h2 id="send-feedback-title">{t("Send feedback")}</h2>
                <p>
                  {t(
                    "Tell us what worked, what did not, or what should change.",
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                disabled={isSubmitting}
                aria-label={t("Close feedback form")}
              >
                ×
              </button>
            </header>

            {error && (
              <div className={styles.feedbackError} role="alert">
                {error}
              </div>
            )}
            {success ? (
              <div className={styles.feedbackSuccess} role="status">
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>{t("Feedback received")}</strong>
                  <p>{success}</p>
                  <button type="button" onClick={closeDialog}>
                    {t("Done")}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className={styles.feedbackFormGrid}>
                  <label className={styles.inputGroup}>
                    <span>{t("Module or page")}</span>
                    <input
                      required
                      maxLength={100}
                      value={draft.module}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          module: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className={styles.inputGroup}>
                    <span>{t("Feedback type")}</span>
                    <select
                      value={draft.feedback_type}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          feedback_type: event.target.value as FeedbackType,
                        }))
                      }
                    >
                      {FEEDBACK_TYPES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {t(option.label)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.inputGroup}>
                    <span>{t("Priority")}</span>
                    <select
                      value={draft.priority}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          priority: event.target.value as FeedbackPriority,
                        }))
                      }
                    >
                      {FEEDBACK_PRIORITIES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {t(option.label)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label
                    className={`${styles.inputGroup} ${styles.feedbackWide}`}
                  >
                    <span>{t("Title")}</span>
                    <input
                      autoFocus
                      required
                      minLength={3}
                      maxLength={180}
                      placeholder={t("Summarise your feedback")}
                      value={draft.title}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label
                    className={`${styles.inputGroup} ${styles.feedbackWide}`}
                  >
                    <span>{t("Description")}</span>
                    <textarea
                      required
                      minLength={10}
                      maxLength={5000}
                      rows={4}
                      placeholder={t(
                        "Describe what happened or what you need.",
                      )}
                      value={draft.description}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label
                    className={`${styles.inputGroup} ${styles.feedbackWide}`}
                  >
                    <span>
                      {t("Suggested change")} <small>{t("Optional")}</small>
                    </span>
                    <textarea
                      maxLength={5000}
                      rows={3}
                      placeholder={t("How would you like this to work?")}
                      value={draft.suggested_change}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          suggested_change: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label
                    className={`${styles.inputGroup} ${styles.feedbackWide}`}
                  >
                    <span>
                      {t("Screenshot")}{" "}
                      <small>
                        {t("Optional")} <T>· maximum 8 MB</T>
                      </small>
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) =>
                        chooseScreenshot(event.target.files?.[0])
                      }
                    />
                    {screenshot && (
                      <small>
                        {t("Attached")}: {screenshot.name}
                      </small>
                    )}
                  </label>
                </div>
                <footer>
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={isSubmitting}
                  >
                    {t("Cancel")}
                  </button>
                  <button
                    className={styles.primaryButton}
                    type="submit"
                    disabled={isSubmitting}
                  >
                    {isSubmitting
                      ? t("Sending feedback...")
                      : t("Send feedback")}
                  </button>
                </footer>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}

export function FeedbackManagement({
  currentUser,
  canManage,
  onToast,
}: {
  currentUser: AuthenticatedUser;
  canManage: boolean;
  onToast: (message: string) => void;
}) {
  const { locale, t } = useLanguage();
  const [feedback, setFeedback] = useState<FeedbackPage>(EMPTY_FEEDBACK_PAGE);
  const [selected, setSelected] = useState<FeedbackItem | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<FeedbackType | "">("");
  const [priorityFilter, setPriorityFilter] = useState<FeedbackPriority | "">(
    "",
  );
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | "">("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const [editPriority, setEditPriority] = useState<FeedbackPriority>("medium");
  const [editStatus, setEditStatus] = useState<FeedbackStatus>("new");
  const [assignedTo, setAssignedTo] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [assignees, setAssignees] = useState<ManagedUser[]>([]);

  const loadFeedback = useCallback(
    async (page = 1) => {
      setIsLoading(true);
      setError("");
      try {
        setFeedback(
          await getFeedback({
            q: query.trim(),
            feedbackType: typeFilter,
            priority: priorityFilter,
            status: statusFilter,
            page,
          }),
        );
      } catch (caughtError) {
        setError(
          friendlyError(
            caughtError,
            "Feedback could not be loaded. Try again.",
          ),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [priorityFilter, query, statusFilter, typeFilter],
  );

  useEffect(() => {
    let active = true;
    getFeedback({ page: 1 })
      .then((data) => {
        if (active) setFeedback(data);
      })
      .catch((caughtError) => {
        if (active) {
          setError(
            friendlyError(
              caughtError,
              "Feedback could not be loaded. Try again.",
            ),
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    getManagedUsers()
      .then((users) => setAssignees(users.filter((user) => user.is_active)))
      .catch(() => setAssignees([]));
  }, []);

  async function openFeedback(feedbackId: string) {
    setError("");
    try {
      const item = await getFeedbackItem(feedbackId);
      setSelected(item);
      setEditPriority(item.priority);
      setEditStatus(item.status);
      setAssignedTo(item.assigned_to_id || "");
      setInternalNote(item.internal_note || "");
    } catch (caughtError) {
      setError(
        friendlyError(caughtError, "Feedback details could not be opened."),
      );
    }
  }

  async function saveFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setIsSaving(true);
    setError("");
    try {
      const updated = await updateFeedback(selected.id, {
        priority: editPriority,
        status: editStatus,
        assigned_to_id: assignedTo || null,
        clear_assignment: !assignedTo,
        internal_note: internalNote.trim(),
      });
      setSelected(updated);
      onToast("Feedback review updated.");
      await loadFeedback(feedback.page);
    } catch (caughtError) {
      setError(
        friendlyError(caughtError, "Feedback changes could not be saved."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function exportFeedback() {
    setIsExporting(true);
    setError("");
    try {
      const file = await downloadFeedbackExport({
        q: query.trim(),
        feedbackType: typeFilter,
        priority: priorityFilter,
        status: statusFilter,
      });
      const url = URL.createObjectURL(file.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      onToast("Feedback export downloaded.");
    } catch (caughtError) {
      setError(
        friendlyError(caughtError, "The feedback export could not be created."),
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className={styles.feedbackManagement}>
      <div className={styles.feedbackSummary}>
        <div>
          <span>{t("Demo review centre")}</span>
          <h2>{t("User feedback")}</h2>
          <p>
            {t(
              "Review suggestions from every department and keep decisions visible throughout the demo.",
            )}
          </p>
        </div>
        <div className={styles.feedbackSummaryCount}>
          <strong>{feedback.total}</strong>
          <span>{t("requests")}</span>
        </div>
      </div>

      {error && (
        <div className={styles.feedbackError} role="alert">
          {error}
          <button type="button" onClick={() => setError("")}>
            {t("Dismiss")}
          </button>
        </div>
      )}

      <form
        className={styles.feedbackFilters}
        onSubmit={(event) => {
          event.preventDefault();
          void loadFeedback();
        }}
      >
        <label className={styles.feedbackSearch}>
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            placeholder={t("Search title, description or submitter")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          aria-label={t("Feedback type")}
          value={typeFilter}
          onChange={(event) =>
            setTypeFilter(event.target.value as FeedbackType | "")
          }
        >
          <option value="">{t("All types")}</option>
          {FEEDBACK_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </select>
        <select
          aria-label={t("Priority")}
          value={priorityFilter}
          onChange={(event) =>
            setPriorityFilter(event.target.value as FeedbackPriority | "")
          }
        >
          <option value="">{t("All priorities")}</option>
          {FEEDBACK_PRIORITIES.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </select>
        <select
          aria-label={t("Status")}
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as FeedbackStatus | "")
          }
        >
          <option value="">{t("All statuses")}</option>
          {FEEDBACK_STATUSES.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </select>
        <button
          className={styles.primaryButton}
          type="submit"
          disabled={isLoading}
        >
          {t("Apply")}
        </button>
        {canManage && (
          <button type="button" onClick={exportFeedback} disabled={isExporting}>
            {isExporting ? t("Exporting...") : t("Export CSV")}
          </button>
        )}
      </form>

      <div className={styles.feedbackTable} aria-busy={isLoading}>
        <div className={styles.feedbackTableHead}>
          <span>{t("Request")}</span>
          <span>{t("Module")}</span>
          <span>{t("Priority")}</span>
          <span>{t("Status")}</span>
          <span>{t("Submitted")}</span>
        </div>
        {isLoading ? (
          <div className={styles.feedbackLoading}>
            <i />
            <i />
            <i />
            <span>{t("Loading feedback...")}</span>
          </div>
        ) : feedback.items.length ? (
          feedback.items.map((item) => (
            <button
              className={styles.feedbackTableRow}
              type="button"
              key={item.id}
              onClick={() => void openFeedback(item.id)}
            >
              <span>
                <strong>{item.title}</strong>
                <small>
                  {t(demoOptionLabel(FEEDBACK_TYPES, item.feedback_type))} ·{" "}
                  {item.submitted_by_name}
                </small>
              </span>
              <span>{item.module_page}</span>
              <span>
                <em data-priority={item.priority}>
                  {t(demoOptionLabel(FEEDBACK_PRIORITIES, item.priority))}
                </em>
              </span>
              <span>
                <em data-status={item.status}>
                  {t(demoOptionLabel(FEEDBACK_STATUSES, item.status))}
                </em>
              </span>
              <time>{formatFeedbackDate(item.created_at, locale)}</time>
            </button>
          ))
        ) : (
          <div className={styles.feedbackEmpty}>
            <span aria-hidden="true">✦</span>
            <strong>{t("No feedback found")}</strong>
            <p>
              {t(
                "Try clearing a filter or wait for users to send their ideas.",
              )}
            </p>
          </div>
        )}
      </div>

      {feedback.pages > 1 && (
        <div className={styles.pagination}>
          <button
            type="button"
            disabled={feedback.page <= 1 || isLoading}
            onClick={() => void loadFeedback(feedback.page - 1)}
          >
            {t("Previous")}
          </button>
          <span>
            {t("Page {{page}} of {{pages}}", {
              page: feedback.page,
              pages: feedback.pages,
            })}
          </span>
          <button
            type="button"
            disabled={feedback.page >= feedback.pages || isLoading}
            onClick={() => void loadFeedback(feedback.page + 1)}
          >
            {t("Next")}
          </button>
        </div>
      )}

      {selected && (
        <div className={styles.feedbackBackdrop} role="presentation">
          <aside
            className={`${styles.feedbackDialog} ${styles.feedbackDetail}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-detail-title"
          >
            <header>
              <div>
                <span>
                  {t(demoOptionLabel(FEEDBACK_TYPES, selected.feedback_type))} ·{" "}
                  {selected.module_page}
                </span>
                <h2 id="feedback-detail-title">{selected.title}</h2>
                <p>
                  {t("Submitted by {{name}} on {{date}}", {
                    name: selected.submitted_by_name,
                    date: formatFeedbackDate(selected.created_at, locale),
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label={t("Close feedback details")}
              >
                ×
              </button>
            </header>
            <div className={styles.feedbackDetailBody}>
              <section>
                <span>{t("Description")}</span>
                <p>{selected.description}</p>
              </section>
              <section>
                <span>{t("Suggested change")}</span>
                <p>
                  {selected.suggested_change ||
                    t("No suggested change was provided.")}
                </p>
              </section>
              {feedbackImageUrl(selected.screenshot_url) && (
                <section>
                  <span>{t("Screenshot")}</span>
                  <a
                    className={styles.feedbackScreenshot}
                    href={
                      feedbackImageUrl(selected.screenshot_url) ?? undefined
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={feedbackImageUrl(selected.screenshot_url) ?? ""}
                      alt="User-submitted feedback screenshot"
                    />
                    <small>{t("Open full size")} ↗</small>
                  </a>
                </section>
              )}
              {canManage ? (
                <form
                  className={styles.feedbackReviewForm}
                  onSubmit={saveFeedback}
                >
                  <div>
                    <label className={styles.inputGroup}>
                      <span>{t("Priority")}</span>
                      <select
                        value={editPriority}
                        onChange={(event) =>
                          setEditPriority(
                            event.target.value as FeedbackPriority,
                          )
                        }
                      >
                        {FEEDBACK_PRIORITIES.map((option) => (
                          <option key={option.value} value={option.value}>
                            {t(option.label)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.inputGroup}>
                      <span>{t("Status")}</span>
                      <select
                        value={editStatus}
                        onChange={(event) =>
                          setEditStatus(event.target.value as FeedbackStatus)
                        }
                      >
                        {FEEDBACK_STATUSES.map((option) => (
                          <option key={option.value} value={option.value}>
                            {t(option.label)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className={styles.inputGroup}>
                    <span>{t("Assigned to")}</span>
                    <select
                      value={assignedTo}
                      onChange={(event) => setAssignedTo(event.target.value)}
                    >
                      <option value="">{t("Unassigned")}</option>
                      {selected.assigned_to_id &&
                        !assignees.some(
                          (user) => user.id === selected.assigned_to_id,
                        ) && (
                          <option value={selected.assigned_to_id}>
                            {selected.assigned_to_name || "Current assignee"}
                          </option>
                        )}
                      {assignees.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.full_name} ({user.username})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.inputGroup}>
                    <span>{t("Internal note")}</span>
                    <textarea
                      rows={4}
                      maxLength={5000}
                      placeholder={t("Add context for the review team")}
                      value={internalNote}
                      onChange={(event) => setInternalNote(event.target.value)}
                    />
                  </label>
                  <footer>
                    <button type="button" onClick={() => setSelected(null)}>
                      {t("Close")}
                    </button>
                    <button
                      className={styles.primaryButton}
                      type="submit"
                      disabled={isSaving}
                    >
                      {isSaving ? t("Saving...") : t("Save review")}
                    </button>
                  </footer>
                </form>
              ) : (
                <section className={styles.feedbackReadOnlyReview}>
                  <span>{t("Review progress")}</span>
                  <p>
                    {demoOptionLabel(FEEDBACK_STATUSES, selected.status)} ·{" "}
                    {demoOptionLabel(FEEDBACK_PRIORITIES, selected.priority)}{" "}
                    <T>priority</T>
                  </p>
                  <small>
                    <T>Assigned to</T>{" "}
                    {selected.assigned_to_name || "the demo review team"}.
                  </small>
                </section>
              )}
            </div>
          </aside>
        </div>
      )}

      <small className={styles.feedbackManagerIdentity}>
        {t("Reviewing as {{name}}", { name: currentUser.full_name })}
      </small>
    </section>
  );
}
