/**
 * Imágenes placeholder para MOCK_IMAGE_GEN=true.
 * Track 4 puede ampliar este set.
 */

export const MOCK_IMAGE_URLS = [
  "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1024",
  "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1024",
  "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=1024",
  "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=1024",
  "https://images.unsplash.com/photo-1551803091-e20673f15770?w=1024",
  "https://images.unsplash.com/photo-1581044777550-4cfa60707c03?w=1024",
];

export function pickMockImage(seed: string): string {
  const hash = [...seed].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return MOCK_IMAGE_URLS[hash % MOCK_IMAGE_URLS.length]!;
}
