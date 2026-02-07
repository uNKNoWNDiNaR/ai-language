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
};

export function SuggestedReviewCard({
  visible,
  items,
  loading,
  onReviewNow,
  onDismiss,
}: SuggestedReviewCardProps) {
  if (!visible) return null;

  return (
    <div
      className="fadeIn"
      style={{
        marginBottom: 12,
        padding: 12,
        borderRadius: 16,
        border: "1px solid var(--border)",
        background: "var(--accent-soft)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.8 }}>Optional review</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Optional</div>
      </div>

      <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 10 }}>
        Optional review ready ({items.length} item{items.length === 1 ? "" : "s"}). Continue when
        you're ready.
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {items.slice(0, 3).map((it, idx) => (
          <div
            key={`${it.id ?? it.lessonId}-${idx}`}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              background: "var(--surface-muted)",
              border: "1px solid var(--border)",
              fontSize: 12,
              opacity: 0.92,
            }}
          >
            {(it.conceptTag && it.conceptTag.replace(/_/g, " ")) || "Review item"}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", rowGap: 8 }}>
        <button
          onClick={onReviewNow}
          disabled={loading}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid",
            borderColor: loading ? "var(--border)" : "var(--accent)",
            background: loading ? "var(--surface-muted)" : "var(--accent)",
            color: loading ? "var(--text-muted)" : "white",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          Review now
        </button>
        <button
          onClick={onDismiss}
          disabled={loading}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "white",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
