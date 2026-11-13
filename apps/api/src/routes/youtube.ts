import { Router, Request, Response } from 'express';
// @ts-ignore
import yts from 'yt-search';

const router = Router();

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  thumbnail: string;
  duration: string;
  author: string;
  url: string;
  views: number;
}

// GET /api/youtube/search?q=...
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  const query = req.query.q as string;
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    res.status(400).json({ error: 'Search query "q" is required' });
    return;
  }

  const cleanQuery = query.trim();

  try {
    const searchResults = await yts(cleanQuery);
    const videos = (searchResults.videos || []).slice(0, 15).map((v: any) => ({
      videoId: v.videoId,
      title: v.title,
      thumbnail: v.thumbnail || `https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg`,
      duration: v.timestamp || '',
      author: v.author?.name || 'YouTube',
      url: v.url,
      views: v.views || 0,
    }));

    res.json({ results: videos });
  } catch (err: any) {
    console.error('[YouTube Search] Error:', err);
    res.status(500).json({ error: 'Failed to search YouTube: ' + err.message });
  }
});

export default router;
