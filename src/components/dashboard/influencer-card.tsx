"use client";

import { useState } from "react";
import { DmPanel } from "@/components/dashboard/dm-panel";
import { motion } from "framer-motion";

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

export function InfluencerCard({ influencer }: InfluencerCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 overflow-hidden rounded-full bg-slate-800">
          {influencer.avatar_url ? (
            <img src={influencer.avatar_url} alt={influencer.display_name} className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-100">{influencer.display_name}</p>
          <p className="text-xs text-cyan-200">@{influencer.handle}</p>
          <p className="mt-1 text-xs text-slate-400">
            {`${influencer.followers_count.toLocaleString()} seguidores · ${influencer.engagement_rate}% ER · match ${Math.round(influencer.match_score * 100)}%`}
          </p>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="text-xs text-cyan-200">
          Ver DMs
        </button>
      </div>

      {open ? (
        <div className="mt-3">
          <DmPanel
            initialMessage={influencer.draft_messages.initial}
            followUpMessage={influencer.draft_messages.follow_up}
          />
        </div>
      ) : null}
    </motion.article>
  );
}
