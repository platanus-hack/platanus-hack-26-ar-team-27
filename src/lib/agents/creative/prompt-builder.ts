/**
 * Builds 3 image prompts per SKU: lifestyle, context, comparative.
 * Uses brand brief + product data to make prompts brand-aware.
 */

import type { ImageStyle } from "@/lib/db/schema";

export interface ImagePromptInput {
  productName: string;
  productDescription: string | null;
  category: string | null;
  brandName: string | null;
  toneOfVoice: string | null;
  targetDescription: string | null;
}

export interface ImagePromptOutput {
  style: ImageStyle;
  prompt: string;
}

const STYLE_TEMPLATES: Record<
  ImageStyle,
  (input: ImagePromptInput) => string
> = {
  lifestyle: ({ productName, brandName, targetDescription, toneOfVoice }) => {
    const brand = brandName ?? "the brand";
    const audience = targetDescription ?? "modern consumers";
    const tone = toneOfVoice ?? "elegant and aspirational";
    return (
      `Lifestyle product photography of ${productName} by ${brand}. ` +
      `The product is being used naturally by ${audience} in a real-life setting. ` +
      `Mood: ${tone}. Soft natural light, clean composition, editorial quality. ` +
      `The product is clearly visible and recognizable. No text overlay.`
    );
  },

  context: ({ productName, category, brandName }) => {
    const contextHint =
      category === "fashion"
        ? "styled outfit on a model in an urban setting"
        : category === "beauty"
          ? "beauty flat lay on a marble surface with complementary props"
          : category === "food"
            ? "beautifully plated on a dining table with natural light"
            : "displayed in a well-designed interior space";
    const brand = brandName ?? "the brand";
    return (
      `Product context shot of ${productName} by ${brand}. ` +
      `Scene: ${contextHint}. ` +
      `High-end commercial photography, sharp focus on product, bokeh background, ` +
      `warm color palette, aspirational atmosphere. No text overlay.`
    );
  },

  comparative: ({ productName, brandName, targetDescription }) => {
    const audience = targetDescription ?? "consumers";
    const brand = brandName ?? "the brand";
    return (
      `Before-and-after concept ad for ${productName} by ${brand}. ` +
      `Split composition: left side shows the problem that ${audience} faces without the product; ` +
      `right side shows the positive transformation with ${productName}. ` +
      `Clean graphic style, bold visual contrast, professional advertising photography. No text overlay.`
    );
  },
};

export function buildImagePrompts(input: ImagePromptInput): ImagePromptOutput[] {
  const styles: ImageStyle[] = ["lifestyle", "context", "comparative"];
  return styles.map((style) => ({
    style,
    prompt: STYLE_TEMPLATES[style](input),
  }));
}
