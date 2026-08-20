export default function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative grid h-8 w-8 place-items-center rounded-[10px] bg-brand-500 shadow-[0_6px_16px_-6px_rgba(91,42,214,.8)]">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
          <path d="M13.6 2 5 13.2h5.2L9.4 22 19 10.4h-5.6L13.6 2Z" fill="white" />
        </svg>
      </span>
      <span
        className={`font-display text-[19px] font-extrabold tracking-tight ${dark ? "text-white" : "text-ink"}`}
      >
        Zapply
      </span>
    </span>
  );
}
