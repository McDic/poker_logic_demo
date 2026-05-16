import type { HandSlots, PickerTarget } from "../lib/state";
import { CardSlot } from "./CardSlot";

interface Props {
  index: number;
  hand: HandSlots;
  canRemove: boolean;
  onOpen: (target: PickerTarget) => void;
  onClear: (target: PickerTarget) => void;
  onRemove: () => void;
}

export function PlayerRow({ index, hand, canRemove, onOpen, onClear, onRemove }: Props) {
  const label = `P${index + 1}`;
  return (
    <div className="player-row">
      <div className="player-row__label">{label}</div>
      <CardSlot
        slot={hand[0]}
        onOpen={() => onOpen({ kind: "hand", player: index, index: 0 })}
        onClear={() => onClear({ kind: "hand", player: index, index: 0 })}
      />
      <CardSlot
        slot={hand[1]}
        onOpen={() => onOpen({ kind: "hand", player: index, index: 1 })}
        onClear={() => onClear({ kind: "hand", player: index, index: 1 })}
      />
      <button
        type="button"
        className="player-row__remove"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label={`Remove ${label}`}
        title={canRemove ? `Remove ${label}` : "Minimum 2 players"}
      >
        Remove
      </button>
    </div>
  );
}
