interface ColourSwatchProps {
  hex: string
  /** Colour name, always shown in text next to the swatch. */
  name: string
  /** Avoid colours carry a diagonal strike. */
  avoid?: boolean
  size?: number
}

/** Square swatch with a 1.5px ink outline. Decorative: the name carries the meaning. */
export function ColourSwatch({ hex, avoid = false, size = 24 }: Omit<ColourSwatchProps, 'name'>) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-block shrink-0 overflow-hidden border-[1.5px] border-ink"
      style={{ width: size, height: size, backgroundColor: hex }}
    >
      {avoid && (
        <span
          className="absolute left-1/2 top-1/2 block h-[3px] w-[150%] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-ink"
          style={{ boxShadow: 'inset 0 0 0 0.5px #fff' }}
        />
      )}
    </span>
  )
}

/** 168x54 white card used on the profile: swatch, then the colour name. */
export function ColourCard({ hex, name, avoid = false }: ColourSwatchProps) {
  return (
    <li className="flex h-[54px] items-center gap-3 border-[1.5px] border-ink bg-card px-2">
      <ColourSwatch hex={hex} avoid={avoid} size={38} />
      <span className="min-w-0 font-display text-base font-bold uppercase leading-tight tracking-[0.5px]">
        {name}
        {avoid && <span className="sr-only"> (skip)</span>}
      </span>
    </li>
  )
}
