import type { MetadataRoute } from 'next';
import { EVENT } from '@/lib/event';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${EVENT.name} judging and venue`,
    short_name: EVENT.name,
    description: `${EVENT.fullName}: judging, venue map and memory wall.`,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#2B0B5E',
    theme_color: '#2B0B5E',
    lang: 'en',
    categories: ['education', 'events', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Judging', url: '/judge', description: 'Score stalls' },
      { name: 'Venue map', url: '/map', description: '2D plan and 3D view' },
      { name: 'Memory wall', url: '/wall', description: 'Photos and videos from past LEEDs' },
    ],
  };
}
