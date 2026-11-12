// Event facts, from the event proposal (Kertas Kerja Karnival Keusahawanan LEED FSKTM 2026)
// and the BIT21603 project brief (mottos and clusters).

export const EVENT = {
  name: 'LEED 26',
  fullName: 'Learn and Earn Entrepreneurship Day 2026',
  organiser: 'Fakulti Sains Komputer dan Teknologi Maklumat (FSKTM)',
  coOrganiser: 'Kelab Teknologi Maklumat (ITC)',
  partner: 'Pusat Teknousahawan Universiti (PTU)',
  participants: 341,
  courses: ['BIC31903', 'BIC31802', 'BIT31502', 'BIT21603'],
  university: 'Universiti Tun Hussein Onn Malaysia',
  venue: 'FSKTM Parking Lot, UTHM',
  address: '86400 Parit Raja, Batu Pahat, Johor',
  dates: '9 & 10 December 2026',
  days: 'Wednesday & Thursday',
  hours: '9:00 am to 5:00 pm on day one, 8:00 am to 5:00 pm on day two',
  start: '2026-12-09T09:00:00+08:00',
  end: '2026-12-10T17:00:00+08:00',
  mottos: ['Learn, Create, Sell, Grow', 'Small Business, Big Dreams', 'Come Support, Shop, Enjoy!'],
  instagram: 'https://instagram.com/leed.uthm',
  instagramHandle: '@leed.uthm',
} as const;

export const CLUSTERS = [
  { id: 'food', name: 'Food & Beverages', note: 'Malaysian and international' },
  { id: 'fashion', name: 'Fashion & Accessories', note: 'Clothing, products and accessories' },
  { id: 'local', name: 'Local Products & Creative Business', note: 'Handmade, local and creative work' },
  { id: 'talent', name: 'Student Talent & Services', note: 'Skills, services and innovation' },
] as const;

export type ClusterId = (typeof CLUSTERS)[number]['id'];

export function clusterName(id: string | null | undefined): string {
  return CLUSTERS.find((c) => c.id === id)?.name ?? 'Cluster not set';
}

/** Programme, from the event proposal (Lampiran 1). */
export const SCHEDULE: { day: string; date: string; items: { time: string; what: string }[] }[] = [
  {
    day: 'Day 1',
    date: 'Wednesday, 9 December',
    items: [
      { time: '8:00 am', what: 'Stalls set up' },
      { time: '9:00 am', what: 'Selling begins' },
      { time: '12:00 pm to 5:00 pm', what: 'Selling continues. Stall judging' },
    ],
  },
  {
    day: 'Day 2',
    date: 'Thursday, 10 December',
    items: [
      { time: '8:00 am to 5:00 pm', what: 'Selling, day two' },
      { time: '2:00 pm', what: 'Closing ceremony: guests arrive' },
      { time: '2:25 pm', what: 'Official address by the Deputy Vice-Chancellor (Student Affairs and Alumni), UTHM' },
      { time: '2:30 pm to 4:00 pm', what: 'Prize giving' },
      { time: '5:00 pm', what: 'Carnival ends' },
    ],
  },
];
