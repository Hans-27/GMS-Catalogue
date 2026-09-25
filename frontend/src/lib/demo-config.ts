export const DEMO_VERSION = "Demo v0.1.0";

export const DEMO_ENVIRONMENT_LABEL = "Demo environment";

export const DEMO_REVIEW_MESSAGE =
  "This system is currently under review. Features and workflows may change based on user feedback.";

export const FEEDBACK_TYPES = [
  { value: "bug", label: "Bug" },
  { value: "improvement", label: "Improvement" },
  { value: "new_feature", label: "New Feature" },
  { value: "ui_change", label: "UI Change" },
  { value: "workflow_change", label: "Workflow Change" },
  { value: "permission_change", label: "Permission Change" },
  { value: "report_request", label: "Report Request" },
] as const;

export const FEEDBACK_PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

export const FEEDBACK_STATUSES = [
  { value: "new", label: "New" },
  { value: "under_review", label: "Under Review" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "completed", label: "Completed" },
] as const;

export type FeedbackTypeValue = (typeof FEEDBACK_TYPES)[number]["value"];
export type FeedbackPriorityValue =
  (typeof FEEDBACK_PRIORITIES)[number]["value"];
export type FeedbackStatusValue =
  (typeof FEEDBACK_STATUSES)[number]["value"];

export function demoOptionLabel(
  options: readonly { value: string; label: string }[],
  value: string,
) {
  return options.find((option) => option.value === value)?.label ?? value;
}
