import type { CommunitySlots, PickerTarget } from "../lib/state";
import { CardSlot } from "./CardSlot";

interface Props {
  community: CommunitySlots;
  onOpen: (target: PickerTarget) => void;
  onClear: (target: PickerTarget) => void;
}

const LABELS = ["Flop 1", "Flop 2", "Flop 3", "Turn"] as const;

export function BoardRow({ community, onOpen, onClear }: Props) {
  return (
    <div className="board-row">
      {community.map((slot, i) => {
        const target: PickerTarget = {
          kind: "community",
          index: i as 0 | 1 | 2 | 3,
        };
        return (
          <CardSlot
            key={i}
            slot={slot}
            label={LABELS[i]}
            onOpen={() => onOpen(target)}
            onClear={() => onClear(target)}
          />
        );
      })}
    </div>
  );
}
