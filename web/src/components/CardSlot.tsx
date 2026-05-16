import type { Slot } from "../lib/state";
import { CardLabel } from "./CardLabel";

interface Props {
  slot: Slot;
  label?: string;
  onOpen: () => void;
  onClear?: () => void;
}

/**
 * A clickable card slot. Click anywhere to open the picker.
 * When filled, an "X" button to the right clears the slot.
 */
export function CardSlot({ slot, label, onOpen, onClear }: Props) {
  return (
    <div className="slot-wrap">
      {label && <div className="slot-wrap__label">{label}</div>}
      <div className="slot-row">
        <button
          type="button"
          className={`slot ${slot ? "slot--filled" : "slot--empty"}`}
          onClick={onOpen}
          aria-label={slot ? `Card ${slot}, click to change` : "Empty slot, click to set"}
        >
          {slot ? <CardLabel card={slot} /> : <span className="slot__placeholder">+</span>}
        </button>
        {slot && onClear && (
          <button
            type="button"
            className="slot__clear"
            onClick={onClear}
            aria-label="Clear card"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
