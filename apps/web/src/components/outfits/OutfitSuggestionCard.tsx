'use client'

export interface OutfitPiece {
  label: string
  colour_hex: string
  item_id: string | null
  in_wardrobe: boolean
}

export interface OutfitSuggestion {
  name: string
  occasion: string
  pieces: OutfitPiece[]
  description: string
}

interface Props {
  suggestion: OutfitSuggestion
  onSave: () => Promise<void>
  saved: boolean
  saving: boolean
}

export default function OutfitSuggestionCard({ suggestion, onSave, saved, saving }: Props) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <h3 className="text-white font-bold text-sm">{suggestion.name}</h3>
          <span className="text-xs text-purple-400 font-medium">{suggestion.occasion}</span>
        </div>
        <button
          onClick={onSave}
          disabled={saved || saving}
          className={`text-xs font-bold px-3 py-1.5 rounded-lg shrink-0 transition-colors ${
            saved
              ? 'bg-green-600/20 text-green-400 border border-green-600/30 cursor-default'
              : 'bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50'
          }`}
        >
          {saved ? '✓ Saved' : saving ? '…' : 'Save'}
        </button>
      </div>

      {/* Colour swatches */}
      <div className="flex gap-1.5 mb-3">
        {suggestion.pieces.slice(0, 5).map((piece, i) => (
          <div key={i} className="relative" title={piece.label}>
            <div
              className="w-7 h-7 rounded-full border-2 border-zinc-700"
              style={{ background: piece.colour_hex }}
            />
            {piece.in_wardrobe && (
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full flex items-center justify-center">
                <span className="text-white text-[7px] font-bold leading-none">✓</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Piece labels */}
      <div className="flex flex-wrap gap-1 mb-3">
        {suggestion.pieces.map((piece, i) => (
          <span
            key={i}
            className={`text-[10px] px-2 py-0.5 rounded-full ${
              piece.in_wardrobe
                ? 'bg-green-900/30 text-green-400 border border-green-800/50'
                : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            {piece.label}
          </span>
        ))}
      </div>

      <p className="text-zinc-400 text-xs leading-relaxed">{suggestion.description}</p>
    </div>
  )
}
