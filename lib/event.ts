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

/** Food categories a seller picks for their stall. */
export const FOOD_CATEGORIES = [
  { id: 'meals', name: 'Main meals' },
  { id: 'snacks', name: 'Snacks and street food' },
  { id: 'desserts', name: 'Desserts and sweets' },
  { id: 'drinks', name: 'Drinks' },
  { id: 'frozen', name: 'Frozen and packaged food' },
  { id: 'non-food', name: 'Not food (products or services)' },
] as const;

export function categoryName(id: string | null | undefined): string | null {
  return FOOD_CATEGORIES.find((c) => c.id === id)?.name ?? null;
}

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

// ---------------------------------------------------------------------------
// Registration and payments (replaces the 2024 Microsoft Forms: "Maklumat Gerai",
// "Pembayaran Sewaan Tapak dan Deposit Kebersihan" and "Business Pitch Video Competition")
// ---------------------------------------------------------------------------

export type PaymentKind = 'deposit' | 'rental';

export interface PaymentInfo {
  kind: PaymentKind;
  title: string;
  /** Ringgit. */
  amount: number;
  breakdown: string;
  payee: string;
  method: string;
  /** Lines to show and copy, in order. */
  details: { label: string; value: string; copy?: boolean }[];
  /** What to write as the payment reference; {n} becomes the two-digit stall number. */
  reference: string;
  /** DuitNow / TnG QR to scan, if any (in /public). */
  qr: string | null;
  /** ISO date, or null until the committee sets it. */
  deadline: string | null;
}

/**
 * The two payments every stall makes. Bank and wallet details come from the committee.
 * TODO(committee): confirm the deadlines and the UTHM payment reference for 2026.
 */
export const PAYMENTS: Record<PaymentKind, PaymentInfo> = {
  deposit: {
    kind: 'deposit',
    title: 'Site rental and cleaning deposit',
    amount: 40,
    breakdown: 'RM20 site rental + RM20 cleaning deposit. The RM20 deposit is refunded to your bank account after the carnival if your stall is left clean.',
    payee: 'Universiti Tun Hussein Onn Malaysia (UTHM)',
    method: 'Bank transfer',
    details: [
      { label: 'Bank', value: 'Bank Muamalat Malaysia Berhad' },
      { label: 'Account name', value: 'Universiti Tun Hussein Onn Malaysia (UTHM)' },
      { label: 'Account number', value: '0107-0000001-716', copy: true },
    ],
    reference: 'LEED26 STALL {n}',
    qr: null,
    deadline: null,
  },
  rental: {
    kind: 'rental',
    title: 'Stall rental',
    amount: 70,
    breakdown: 'RM70 for your share of the canopy, table and chairs.',
    payee: 'SELADEVS DIGITAL',
    method: "Touch 'n Go eWallet or DuitNow QR",
    details: [
      { label: 'Pay to', value: 'SELADEVS DIGITAL' },
      { label: "Touch 'n Go eWallet", value: '9999001235446', copy: true },
    ],
    reference: 'LEED26 STALL {n}',
    qr: '/pay/seladevs-duitnow.jpg',
    deadline: null,
  },
};

export function paymentReference(kind: PaymentKind, stallNumber: number): string {
  return PAYMENTS[kind].reference.replace('{n}', String(stallNumber).padStart(2, '0'));
}

/**
 * Courses and lecturers. Each lecturer's class has a colour, used for the stall number card and the
 * stall colour judges note down. TODO(committee): this is the 2024 list; update it for 2026.
 */
export const COURSES = [
  { id: 'BIT33902', name: 'BIT 33902 Entrepreneurship (Keusahawanan)' },
  { id: 'BIC31802', name: 'BIC 31802 Cyberpreneurship (Keusahawanan Siber)' },
] as const;

export const LECTURERS = [
  { id: 'muhaini', name: 'Dr Muhaini Othman', colour: 'pink' },
  { id: 'zaki', name: 'Dr. Mohd Zaki Mohd Salikon', colour: 'blue' },
  { id: 'zubaile', name: 'Ts. Dr. Zubaile bin Abdullah', colour: 'green' },
  { id: 'fadzlun', name: 'Dr. Siti Fadzlun Binti Md Salleh', colour: 'yellow' },
  { id: 'shahdatunnaim', name: 'Dr. Shahdatunnaim Binti Azmi', colour: 'red' },
] as const;

/** Main product, as on the 2024 stall form (pick one). */
export const MAIN_PRODUCTS = [
  { id: 'main-meal', name: 'Main meals (rice, noodles, spaghetti)' },
  { id: 'light-meal', name: 'Light food (cut fruit, salad, toast, waffles, sushi, crisps)' },
  { id: 'dessert', name: 'Desserts (cakes, doughnuts, kuih, cendol, ais kacang)' },
  { id: 'drink', name: 'Drinks (air balang, ice blended, fruit juice, coffee)' },
  { id: 'clothing', name: 'Clothing (clothes, tudung, accessories)' },
  { id: 'gaming', name: 'Gaming' },
  { id: 'flowers', name: 'Flowers' },
  { id: 'other', name: 'Other' },
] as const;

/** Options on the deposit form, as on the 2024 form (in Malay where the university uses Malay). */
export const PAYER_OPTIONS = {
  states: ['Johor', 'Melaka', 'Negeri Sembilan', 'Selangor', 'Kuala Lumpur', 'Putrajaya', 'Labuan', 'Perak', 'Pulau Pinang', 'Kedah', 'Perlis', 'Kelantan', 'Terengganu', 'Pahang', 'Sabah', 'Sarawak'],
  genders: ['Lelaki', 'Perempuan'],
  bumiputera: ['Bumiputera', 'Bukan bumiputera'],
  levels: ['Diploma', 'Sarjana muda', 'Sarjana', 'Doktor falsafah'],
  years: ['Tahun 1', 'Tahun 2', 'Tahun 3', 'Tahun 4'],
  faculties: ['FKAAB', 'FKEE', 'FKMP', 'FPTP', 'FPTV', 'FSKTM', 'FTK', 'FAST', 'PPD', 'PPUK'],
  fields: ['Kejuruteraan', 'Pendidikan', 'Sains komputer', 'Sains teknologi', 'Matematik', 'Pembuatan', 'Perniagaan', 'Pengurusan', 'Pertanian', 'Lain-lain'],
  collegeTypes: ['Kolej Kediaman Dalam Kampus', 'Kolej Kediaman Luar Kampus', 'Lain-lain'],
  colleges: ['Kolej Kediaman Tun Dr Ismail (KKTDI)', 'Kolej Kediaman Tun Fatimah (KKTF)', 'Kolej Kediaman Perwira', 'Kolej Kediaman Pagoh', 'Tidak berkenaan'],
} as const;
