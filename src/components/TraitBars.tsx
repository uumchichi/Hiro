import { TRAIT_LABELS } from "@/lib/questions";
import type { TraitKey, TraitScores } from "@/lib/types";

export function TraitBars({ traits }: { traits: TraitScores }) {
  return (
    <ul className="space-y-3">
      {(Object.keys(TRAIT_LABELS) as TraitKey[]).map((k) => (
        <li key={k}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-muted">{TRAIT_LABELS[k].low}</span>
            <span className="font-semibold">{TRAIT_LABELS[k].name}</span>
            <span className="text-muted">{TRAIT_LABELS[k].high}</span>
          </div>
          <div className="relative h-2.5 rounded-full bg-line">
            <div className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-brand shadow" style={{ left: `${traits[k]}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
