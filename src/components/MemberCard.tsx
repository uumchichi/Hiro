import type { PublicMember } from "@/lib/server";

export function MemberCard({ m, highlight, children }: { m: PublicMember; highlight?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border p-4 ${highlight ? "border-brand bg-brand-soft" : "border-line bg-surface"}`}>
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-soft text-xl">{m.emoji}</span>
        <div className="min-w-0">
          <p className="font-bold">
            {m.nickname}
            <span className="ml-1.5 text-sm font-normal text-muted">
              {m.age ? `${m.age}세 · ` : ""}
              {m.region}
            </span>
          </p>
          <p className="truncate text-sm text-muted">{m.typeName}</p>
        </div>
      </div>
      {m.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {m.tags.slice(0, 6).map((t) => (
            <span key={t} className="rounded-full bg-bg px-2 py-0.5 text-xs text-muted">#{t}</span>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
