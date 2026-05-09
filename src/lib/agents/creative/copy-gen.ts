/**
 * Copy generation with GPT-4o-mini.
 * 3 frameworks: PAS (problem-agitate-solution), AIDA (attention-interest-desire-action), curiosity hook.
 * Brand brief is injected to respect tone_of_voice and do_not_say.
 */

import OpenAI from "openai";
import type { CopyFramework } from "@/lib/db/schema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface CopyGenParams {
  productName: string;
  productDescription: string | null;
  imagePrompt: string;
  framework: CopyFramework;
  brandName: string | null;
  toneOfVoice: string | null;
  doNotSay: string[];
}

export interface CopyGenResult {
  copyText: string;
  framework: CopyFramework;
}

const FRAMEWORK_INSTRUCTIONS: Record<CopyFramework, string> = {
  PAS: "Use the PAS framework: start with the Problem the customer faces, Agitate it (make them feel it), then present the Solution (the product).",
  AIDA: "Use the AIDA framework: grab Attention, build Interest, create Desire, then call to Action.",
  curiosity:
    "Use a curiosity hook: open with an intriguing question or bold statement that makes the reader want to know more, then deliver the payoff.",
};

export async function generateCopy(
  params: CopyGenParams,
): Promise<CopyGenResult> {
  const {
    productName,
    productDescription,
    imagePrompt,
    framework,
    brandName,
    toneOfVoice,
    doNotSay,
  } = params;

  const doNotSayClause =
    doNotSay.length > 0
      ? `NEVER use these words or phrases: ${doNotSay.join(", ")}.`
      : "";

  const toneClause = toneOfVoice
    ? `Tone of voice: ${toneOfVoice}.`
    : "Keep a friendly, modern tone.";

  const brandClause = brandName ? `Brand: ${brandName}.` : "";

  const systemPrompt = `You are a world-class performance copywriter for social media ads.
${brandClause}
${toneClause}
${doNotSayClause}
Write in Spanish.
Keep the copy concise and punchy — suitable for a Meta/Instagram ad (max 150 words).`;

  const userPrompt = `Product: ${productName}
Description: ${productDescription ?? "No description available."}
Visual context: ${imagePrompt}

${FRAMEWORK_INSTRUCTIONS[framework]}

Write only the ad copy. No labels, no explanations.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 300,
    temperature: 0.8,
  });

  const copyText = response.choices[0]?.message.content?.trim() ?? "";

  return { copyText, framework };
}
