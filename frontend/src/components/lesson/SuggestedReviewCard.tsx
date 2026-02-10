import { useState } from "react";
import { Chip } from "../ui";

type SuggestedReviewCardProps = {
  visible: boolean;
  items: Array<{
    id?: string;
    lessonId?: string;
    conceptTag?: string;
  }>;
  loading: boolean;
  onReviewNow: () => void;
  onDismiss: () => void;
  uiStrings?: {
    optionalReviewLabel?: string;
    optionalLabel?: string;
    reviewNowLabel?: string;
    reviewNotNowLabel?: string;
    reviewReadyMessage?: string;
  };
};

export function SuggestedReviewCard({
  visible,
  items,
  loading,
  onReviewNow,
  onDismiss,
  uiStrings,
}: SuggestedReviewCardProps) {
  if (!visible) return null;

  const optionalReviewLabel = uiStrings?.optionalReviewLabel ?? "Optional review";
  const optionalLabel = uiStrings?.optionalLabel ?? "Optional";
  const reviewNowLabel = uiStrings?.reviewNowLabel ?? "Review now";
  const reviewNotNowLabel = uiStrings?.reviewNotNowLabel ?? "Not now";
  const reviewReadyMessage =
    uiStrings?.reviewReadyMessage ?? "Optional review ready ({count} items). Continue when you're ready.";

  const [showItems, setShowItems] = useState(false);

  const readyText = reviewReadyMessage.replace("{count}", String(items.length));
  const maxVisibleItems = 4;
  const visibleItems = items.slice(0, maxVisibleItems);

  return (
    <div className="fadeIn rounded-2xl border border-slate-300/70 bg-slate-50/80 p-5 shadow-sm ring-1 ring-slate-200/50">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-slate-800">
          {optionalReviewLabel} ({items.length} items)
        </div>
        <div className="text-xs text-slate-500">{optionalLabel}</div>
      </div>

      <p className="mt-1 text-sm text-slate-600">{readyText}</p>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onReviewNow}
          disabled={loading}
          className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {reviewNowLabel}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={loading}
          className="rounded-xl border border-slate-300/70 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
        >
          {reviewNotNowLabel}
        </button>
      </div>

      <button
        type="button"
        className="mt-3 text-sm font-medium text-slate-600 hover:text-slate-800"
        onClick={() => setShowItems((prev) => !prev)}
      >
        {showItems ? "Hide items" : "Show items"}
      </button>

      {showItems && (
        <div className="mt-3 flex flex-wrap gap-2">
          {visibleItems.map((it, idx) => (
            <Chip key={`${it.id ?? it.lessonId}-${idx}`}>
              {(it.conceptTag && it.conceptTag.replace(/_/g, " ")) || "Review item"}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
