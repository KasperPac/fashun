import type { ReactNode } from 'react'

export type TryOnFrameVariant = 'empty' | 'uploading' | 'photo' | 'progress' | 'picture'

function PersonOutline() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  )
}

/** The 3:4 frame for the person's try-on photo: empty (dashed), uploading (dimmed picked photo) or the saved photo. */
export default function TryOnFrame({
  variant,
  src,
  alt = '',
  broken = false,
  onImageError,
  children,
}: {
  variant: TryOnFrameVariant
  /** The photo to show (saved address, or the picked file while uploading). */
  src?: string | null
  /** Description of a finished picture. */
  alt?: string
  /** The picture's address failed to load: show a plain waiting state instead of a broken image. */
  broken?: boolean
  /** Called when the browser can't load the picture. */
  onImageError?: () => void
  children?: ReactNode
}) {
  if (variant === 'progress' || variant === 'picture') {
    const frame = 'relative aspect-[3/4] w-full border-[1.5px] border-ink bg-tile'
    return (
      <div className={frame}>
        {src && broken && variant === 'picture' && (
          <span role="status" className="absolute inset-0 flex items-center justify-center px-4 text-center text-[15px] font-semibold">Loading your picture…</span>
        )}
        {src && !(broken && variant === 'picture') && (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed address, as the other photo screens
          <img src={src} alt={variant === 'picture' ? alt : ''} onError={variant === 'picture' ? onImageError : undefined} className={`h-full w-full object-cover ${variant === 'progress' ? 'opacity-50' : ''}`} />
        )}
        {variant === 'progress' && (
          <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-ink/20">
            <span className="h-24 w-24 animate-scan rounded-full border-[3px] border-dashed border-signal" />
          </span>
        )}
        {children}
      </div>
    )
  }
  const size = 'h-[160px] w-[120px] shrink-0 lg:h-[192px] lg:w-[144px]'
  if (variant === 'empty' || !src) {
    return (
      <div className={`${size} flex items-center justify-center border-[1.5px] border-dashed border-ink bg-tile text-ink`}>
        <PersonOutline />
        {children}
      </div>
    )
  }
  if (variant === 'uploading') {
    return (
      <div className={`${size} relative border-[1.5px] border-ink bg-tile`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed address, as the other photo screens */}
      <img src={src} alt="" className="h-full w-full object-cover opacity-60" />
        <span aria-hidden="true" className="absolute left-1/2 top-1/2 -ml-3 -mt-3 inline-block h-6 w-6 animate-scan rounded-full border-2 border-ink border-t-transparent" />
        {children}
      </div>
    )
  }
  return (
    <div className={`${size} border-2 border-ink bg-tile`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed address, as the other photo screens */}
      <img src={src} alt="Your try-on photo" className="h-full w-full object-cover" />
      {children}
    </div>
  )
}
