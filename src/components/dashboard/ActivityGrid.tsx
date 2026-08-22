"use client";

/** 12-week contribution-style grid of applications per day. */
export default function ActivityGrid({
  data,
  goal = 10,
}: {
  data: { date: string; count: number }[];
  goal?: number;
}) {
  const weeks: { date: string; count: number }[][] = [];
  for (let i = 0; i < data.length; i += 7) weeks.push(data.slice(i, i + 7));

  const tone = (n: number) => {
    if (n === 0) return "bg-canvas border-line";
    if (n < goal * 0.34) return "bg-brand-100 border-brand-100";
    if (n < goal * 0.67) return "bg-brand-300 border-brand-300";
    if (n < goal) return "bg-brand-400 border-brand-400";
    return "bg-brand-500 border-brand-500";
  };

  return (
    <div>
      <div className="flex gap-[3px] overflow-x-auto pb-1 scroll-thin">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((day) => (
              <div
                key={day.date}
                title={`${day.count} application${day.count === 1 ? "" : "s"} on ${day.date}`}
                className={`h-[13px] w-[13px] rounded-[3px] border ${tone(day.count)}`}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="font-mono text-[10px] text-ink-faint">less</span>
        {["bg-canvas border-line", "bg-brand-100 border-brand-100", "bg-brand-300 border-brand-300", "bg-brand-400 border-brand-400", "bg-brand-500 border-brand-500"].map((c) => (
          <span key={c} className={`h-[11px] w-[11px] rounded-[3px] border ${c}`} />
        ))}
        <span className="font-mono text-[10px] text-ink-faint">more</span>
      </div>
    </div>
  );
}
