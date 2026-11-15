import { Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Feedback'

/** Shown instead of the form when the photo isn't a piece of clothing. */
export default function NotClothingNotice({ onTryAnother }: { onTryAnother: () => void }) {
  return (
    <Notice title="This doesn't look like a piece of clothing." role="status">
      Try a photo of just the piece, laid flat or on a hanger.
      <span className="mt-3 block">
        <Button variant="secondary" fullWidth={false} onClick={onTryAnother}>Try another photo</Button>
      </span>
    </Notice>
  )
}
