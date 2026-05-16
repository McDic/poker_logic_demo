import type { Card, Hand } from "../lib/cards";
import type { EquityReport } from "../lib/equity";
import { CardLabel } from "./CardLabel";

interface Props {
  hands: Hand[];
  community: Card[];
  report: EquityReport;
}

export function EquityTable({ hands, community, report }: Props) {
  return (
    <section className="equity">
      <div className="equity__meta">
        <div>
          <span className="label">Board</span>
          <span className="value">
            {community.length === 0 ? (
              <em>(preflop)</em>
            ) : (
              community.map((c, i) => (
                <span key={i} className="value__card">
                  <CardLabel card={c} />
                </span>
              ))
            )}
          </span>
        </div>
        <div>
          <span className="label">Runouts</span>
          <span className="value mono">{report.boardCount.toLocaleString()}</span>
        </div>
      </div>

      <table className="equity__table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Hand</th>
            <th className="num">Equity</th>
            <th className="bar"></th>
          </tr>
        </thead>
        <tbody>
          {hands.map((h, i) => {
            const eq = report.values[i] ?? 0;
            return (
              <tr key={i}>
                <td>P{i + 1}</td>
                <td>
                  <span className="value__card">
                    <CardLabel card={h[0]} />
                  </span>
                  <span className="value__card">
                    <CardLabel card={h[1]} />
                  </span>
                </td>
                <td className="num mono">{(eq * 100).toFixed(2)}%</td>
                <td className="bar">
                  <div className="bar__track">
                    <div
                      className="bar__fill"
                      style={{ width: `${(eq * 100).toFixed(2)}%` }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
