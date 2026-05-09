"use client";

interface WarmupEvent {
  day: number;
  sent: number;
  replied: number;
  opened: number;
  reputation: number;
}

interface WarmupVisProps {
  events: WarmupEvent[];
  dayIdx: number;
  domains: string[];
}

export default function WarmupVis({ events, dayIdx, domains }: WarmupVisProps) {
  const safeIdx = Math.max(0, Math.min(dayIdx, events.length - 1));
  const reputation = dayIdx >= 0 ? events[safeIdx].reputation : 0;
  const evt = events[safeIdx] ?? events[0];

  return (
    <div className="warm-vis">
      <div className="warm-pair">
        <div className="mailbox a">
          <span className="env">✉</span>
          <span className="addr">{domains[0]}</span>
          <span className="rep-pill">rep {Math.round(reputation * 0.97)}</span>
        </div>
        <div className="warm-track">
          <div className="track-line" />
          <div className={`track-flying ${dayIdx >= 0 ? "is-on" : ""}`} key={dayIdx}>✉</div>
          <div className="track-meta">
            <span className="kicker">día {Math.min(dayIdx + 1, events.length)} / {events.length}</span>
            <span className="ev"><b>{evt.sent}</b> sent · <b>{evt.replied}</b> replied · <b>{evt.opened}</b> opened</span>
          </div>
        </div>
        <div className="mailbox b">
          <span className="env">✉</span>
          <span className="addr">{domains[1] ?? domains[0]}</span>
          <span className="rep-pill">rep {reputation}</span>
        </div>
      </div>
      <div className="warm-chart">
        <div className="warm-chart-head">
          <span className="kicker">reputación · {events.length} días</span>
          <span className="cur"><b>{reputation}</b><span className="of">/100</span></span>
        </div>
        <div className="warm-bars">
          {events.map((e, i) => {
            const on = i <= dayIdx;
            const tone = e.reputation >= 80 ? "research" : e.reputation >= 60 ? "warmup" : e.reputation >= 40 ? "domain" : "diagnostic";
            return (
              <div key={i} className={`warm-bar tone-${tone} ${on ? "is-on" : ""}`}>
                <div className="bar-fill" style={{ height: on ? `${e.reputation}%` : "4%" }} />
                <span className="bar-lbl">{i + 1}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
