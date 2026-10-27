import type { Completion } from '../types';

// Weeks start on Monday 00:00 local time
function startOfWeek(now: Date): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d.getTime();
}

export default function PointsBoard({
  memberIds,
  memberNames,
  completions,
  myUid,
}: {
  memberIds: string[];
  memberNames: Record<string, string>;
  completions: Completion[];
  myUid: string | undefined;
}) {
  const weekStart = startOfWeek(new Date());

  const rows = memberIds.map((uid) => {
    let week = 0;
    let total = 0;
    for (const c of completions) {
      if (c.uid !== uid) continue;
      total += c.points;
      if (c.completedAt >= weekStart) week += c.points;
    }
    return { uid, week, total };
  });

  // Only crown a weekly leader when there is an actual lead
  const topWeek = Math.max(0, ...rows.map((r) => r.week));
  const leaders = rows.filter((r) => r.week === topWeek);
  const leaderUid = topWeek > 0 && leaders.length === 1 ? leaders[0].uid : null;

  return (
    <div className="card points-board">
      <div className="points-header">
        <p className="card-title" style={{ margin: 0 }}>Points</p>
        <span className="points-col-label">Week</span>
        <span className="points-col-label">Total</span>
      </div>
      {rows.map((r) => (
        <div className="points-row" key={r.uid}>
          <span className="points-name">
            {memberNames[r.uid] ?? '…'}
            {r.uid === myUid ? ' (you)' : ''}
            {r.uid === leaderUid ? ' 👑' : ''}
          </span>
          <span className="points-value points-week">{r.week}</span>
          <span className="points-value">{r.total}</span>
        </div>
      ))}
    </div>
  );
}
