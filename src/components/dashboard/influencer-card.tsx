"use client";

import { useState } from "react";

export type InfluencerItem = {
  id: string;
  avatar_url: string | null;
  display_name: string;
  handle: string;
  followers_count: number;
  engagement_rate: number;
  match_score: number;
  draft_messages: {
    initial: string;
    follow_up: string;
  };
};

type InfluencerCardProps = {
  influencer: InfluencerItem;
};

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return `${n}`;
}

export function InfluencerCard({ influencer }: InfluencerCardProps) {
  const [tab, setTab] = useState<"initial" | "follow_up">("initial");
  const score = Math.round(influencer.match_score * 100);
  const dash = (score / 100) * 119.4;
  const message =
    tab === "initial"
      ? influencer.draft_messages.initial
      : influencer.draft_messages.follow_up;

  return (
    <article className="inf-card">
      <div className="inf-head">
        <div
          className="inf-av"
          style={
            influencer.avatar_url
              ? { backgroundImage: `url(${influencer.avatar_url})` }
              : undefined
          }
        />
        <div>
          <div className="name">{influencer.display_name}</div>
          <div className="h">@{influencer.handle}</div>
          <div className="stats">
            {formatFollowers(influencer.followers_count)} · {influencer.engagement_rate}% ER · IG
          </div>
        </div>
        <div className="match-donut">
          <svg width="46" height="46" viewBox="0 0 46 46">
            <circle
              cx="23"
              cy="23"
              r="19"
              stroke="rgba(34,211,238,0.15)"
              strokeWidth="3"
              fill="none"
            />
            <circle
              cx="23"
              cy="23"
              r="19"
              stroke="rgb(34 211 238)"
              strokeWidth="3"
              fill="none"
              strokeDasharray={`${dash} 119.4`}
              strokeLinecap="round"
            />
          </svg>
          <span className="num">{score}</span>
        </div>
      </div>

      <div className="dm-tabs">
        <button
          type="button"
          className={`dm-tab${tab === "initial" ? " is-active" : ""}`}
          onClick={() => setTab("initial")}
        >
          Initial
        </button>
        <button
          type="button"
          className={`dm-tab${tab === "follow_up" ? " is-active" : ""}`}
          onClick={() => setTab("follow_up")}
        >
          Follow-up
        </button>
      </div>

      <div className="dm-msg">{message}</div>

      <div className="dm-foot">
        <button
          type="button"
          className="btn"
          style={{ fontSize: 12 }}
          onClick={() => {
            void navigator.clipboard.writeText(message);
          }}
        >
          Copiar
        </button>
        {tab === "follow_up" ? (
          <span className="hint">enviar 3-5 días después</span>
        ) : (
          <span className="hint">match score · cosine</span>
        )}
      </div>
    </article>
  );
}
