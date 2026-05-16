# Black Dealing Demonstration

This project aims to demonstrate "black dealing" (modified probability) in fraud online poker rooms.
I can't believe people think probability modification is hard - I want to demonstrate this is technically easy.
The problem is how to fine-tune this number, not about technical implementation.

## How to modify probability arbitrarily

My algorithm follows:

Let's say multiple players all-ined at some street(preflop, flop, turn):

- Player $i$ has equity $E_i$, then $\sum{E_i} = 1$ and $\forall_i 0 \le E_i \le 1$
- Let's group all future boardings $B_i$ is a set of boardings that makes Player $i$ wins.
  For example, if AA(Player 1) and KK(Player 2) all-ined at K37r flop, then (turn A, river 9) is in $B_1$ and (turn K, river A) is in $B_2$.
- Modified probability of making player $i$ is $M_i$, then select group based on $M$ then pick any future boarding from that group.\

In this way we can put arbitrary probability modification to choose who will win.
There are some chop(tie) scenarios, maybe we can discuss about this further.

## UI

```
(Community Board)
(Player 1 Hand)
(Player 2 Hand)
(Player 3 Hand)
...

(Probability Settings)
(Run Simulation Button)
```

UI should provide following features:

- Upper side:
  - Able to set multiple player's hands
  - Optionally able to set community board(flop + turn)
  - Show the true equity of each player on current board
- Lower side:
  - Make a slider(or choose other better UI if any) that modifies probability for each player
  - Run multiple simulations and show that the result converges to the modified probability
