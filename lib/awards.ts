// LEED 26 competition categories, from "The Competition" (Appendix B rubrics, Components B, C and D).
// db/seed.sql inserts the same competitions and criteria; keep the two in step.
//
// Judges fill in three score sheets: the Stall Competition (Component B), Video Marketing
// (Component D) and the Business Pitch (Component C). The four stall element awards and
// Outstanding Stall are worked out from the stall sheet plus visitors' ratings of the same
// elements: each element is half jury, half customers. Two more awards need no judges:
// Most Popular & Viral Video Marketing (social media likes and shares, entered by the committee)
// and People Choice (visitors' likes).

export interface CriterionDef {
  name: string;
  description: string;
  /** Full marks for this criterion. Level 5 earns all of them, level 0 none. */
  marks: number;
  /** What each level means, from level 0 to level 5. */
  levels: [string, string, string, string, string, string];
  /** For stall elements: the plain-language question visitors answer with 1 to 5 stars. */
  customerQuestion?: string;
}

export interface AwardDef {
  slug: string;
  name: string;
  description: string;
  criteria: CriterionDef[];
}

// Levels run 0 to 5 as in the BIT21603 rubrics. A criterion worth M marks gives level x × M / 5.
export const SCALE_MIN = 0;
export const SCALE_MAX = 5;

const c = (name: string, description: string, marks: number, levels: CriterionDef['levels'], customerQuestion?: string): CriterionDef => ({
  name,
  description,
  marks,
  levels,
  ...(customerQuestion ? { customerQuestion } : {}),
});

export const AWARDS: AwardDef[] = [
  {
    slug: 'stall',
    name: 'Stall Competition',
    description:
      'Judged at the stall on 9 December, 12:00 pm to 5:00 pm. Rubric: BIT21603 Component B. These marks are the jury half of Outstanding Stall and the four stall element awards; visitors rate the same elements for the other half.',
    criteria: [
      c('Product', 'Creativity, quality and attractive presentation of the product or service.', 5, [
        'No implementation.',
        'Very poor quality, messy.',
        'Poor quality, weak presentation.',
        'Adequate quality and presentation.',
        'Creative, good quality, neat presentation.',
        'Highly creative, superior quality, attractive.',
      ], 'How good is what they sell?'),
      c('Price', 'Competitive pricing grounded in at least 2 competitor benchmarks.', 5, [
        'No implementation.',
        'Inappropriate pricing model.',
        'Overpriced, or no competitors compared.',
        'Reasonable, minimal competitor reference.',
        'Competitive, 1 to 2 competitor comparisons.',
        'Highly competitive, affordable, 2 or more competitors compared.',
      ], 'Is the price fair for what you get?'),
      c('Place', 'The stall itself: clean, charming and set up for its target customers.', 5, [
        'No implementation.',
        'Incorrect or missing audience definition.',
        'Vague audience; mismatched platform.',
        'Target audience identified; standard choice.',
        'Clear target audience; strong channel rationale.',
        'Deep, data-backed audience insight; channel aligned.',
      ], 'Is the stall clean and inviting?'),
      c('Promotion', 'Visual appeal, campaign reach and promotional engagement.', 5, [
        'No implementation.',
        'Poor visuals; no promotional effort.',
        'Weak visuals; ineffective campaign.',
        'Acceptable visuals; predictable campaign.',
        'Attractive visuals and effective campaign.',
        'Attractive visuals, high reach and engagement.',
      ], 'How well do they promote and draw you in?'),
      c('Customer Service', 'Provisional wording: friendliness, helpfulness and speed of service at the stall.', 5, [
        'No implementation.',
        'Customers ignored or treated rudely.',
        'Slow or unhelpful service.',
        'Polite; answers basic questions.',
        'Friendly and quick; explains the product well.',
        'Warm, proactive, memorable service for every customer.',
      ], 'How friendly and helpful were they?'),
    ],
  },
  {
    slug: 'video-marketing',
    name: 'Impressive Video Marketing',
    description:
      'Each group may post up to 3 videos; give one set of marks covering all of them. The links are on this sheet. Rubric: BIT21603 Component D.',
    criteria: [
      c('Promotional Engagement', 'Creativity and capacity to motivate consumer action.', 5, [
        'No submission.',
        'Ineffective; fails its engagement purpose.',
        'Low engagement; weak call to action.',
        'Moderate engagement; achieves the basic objective.',
        'Engaging content that motivates viewer action.',
        'Highly engaging, creative, strongly drives viewer action.',
      ]),
      c('Core Value Points', 'Clear communication of core selling points (3 or more USPs).', 5, [
        'No submission.',
        'Complete lack of message clarity or selling points.',
        'Unclear message; minimal value highlights.',
        'Fair clarity, highlighting 1 core selling proposition.',
        'Clear message highlighting 2 core selling propositions.',
        'Exceptional clarity; highlights 3 or more unique selling propositions.',
      ]),
      c('Visual Impact & Branding', 'Visual aesthetics, graphic quality and brand alignment.', 5, [
        'No submission.',
        'No visual branding elements.',
        'Weak, distracting or unpolished visuals.',
        'Minimal visual graphics; partial brand support.',
        'High-quality visuals that support brand presentation.',
        'Superior brand visuals, graphics and aesthetic appeal.',
      ]),
      c('Audio Quality & Balance', 'Clarity, volume balance and soundtrack coordination.', 5, [
        'No submission.',
        'Unusable audio quality.',
        'Poor audio coordination or background noise.',
        'Adequate audio with minor volume imbalance.',
        'Clear, well-balanced audio tracking.',
        'Crystal clear audio, balanced mix, complements the video.',
      ]),
      c('Editing & Production', 'Camera stability, scene transitions and production polish.', 5, [
        'No submission.',
        'Substandard editing and camera control.',
        'Unsteady footage; weak scene transitions.',
        'Adequate camera focus with basic editing.',
        'Steady camera work with effective scene transitions.',
        'Sharp, steady camera work with professional transitions.',
      ]),
    ],
  },
  {
    slug: 'business-pitch',
    name: 'Best Business Pitch with Innovation Element',
    description:
      'Score the 2 to 3 minute pitch video (link on this sheet). Rubric: BIT21603 Component C, including UN SDG 8 (Decent Work and Economic Growth).',
    criteria: [
      c('Concept & Innovation', 'Uniqueness of the value proposition, technological integration and original product or service solution.', 5, [
        'No submission.',
        'Poor concept; no technological link.',
        'Weak concept; minimal tech integration.',
        'Adequate concept with a basic tech link.',
        'Creative, trend-aligned, with good technology application.',
        'Highly unique, trend-aligned, strong tech integration.',
      ]),
      c('Presentation & Demonstration', 'Engaging pitch narrative, crisp visual quality, clear product demonstration and professional editing.', 5, [
        'No submission.',
        'Poor visual quality; no product demo.',
        'Weak visuals; unclear product demo.',
        'Adequate visual presentation and basic demo.',
        'Engaging narrative with clear visuals and product demo.',
        'Highly engaging narrative, crisp visuals, effective demo.',
      ]),
      c('Feasibility & SDG 8 Alignment', 'Realism of the business model, market opportunity, financial viability and explicit UN SDG 8 alignment.', 5, [
        'No submission.',
        'Unrealistic model; no market demand or SDG 8 alignment.',
        'Weak model; vague market and superficial SDG 8 link.',
        'Adequate model with basic SDG 8 and market understanding.',
        'Realistic model with clear SDG 8 relevance and market demand.',
        'Robust model; exceptional SDG 8 integration (decent work and economic growth).',
      ]),
    ],
  },
];

/** Awards worked out from the stall sheet: each element is half jury, half visitors' star ratings. */
export interface StallAwardDef {
  slug: string;
  name: string;
  /** The element(s) of the rubric this award looks at. */
  element: string;
  /** Names of the Stall Competition criteria that count. */
  criteria: string[];
}

export const STALL_AWARDS: StallAwardDef[] = [
  { slug: 'outstanding-stall', name: 'Outstanding Stall', element: 'Overall total of all elements', criteria: ['Product', 'Price', 'Place', 'Promotion', 'Customer Service'] },
  { slug: 'clean-charming', name: 'Clean and Charming Stall', element: 'Place', criteria: ['Place'] },
  { slug: 'brilliant-promotions', name: 'Brilliant Stall Promotions', element: 'Promotion', criteria: ['Promotion'] },
  { slug: 'hottest-product', name: 'Hottest Product', element: 'Product and Price', criteria: ['Product', 'Price'] },
  { slug: 'superb-service', name: 'Superb Customer Service', element: 'Customer Service', criteria: ['Customer Service'] },
];

/** Marks available from the jury for a stall award (customers add the same again). */
export function stallAwardJuryMarks(a: StallAwardDef): number {
  const stall = AWARDS.find((x) => x.slug === 'stall')!;
  return stall.criteria.filter((k) => a.criteria.includes(k.name)).reduce((n, k) => n + k.marks, 0);
}

/** Decided by visitors: one like or "not for me" per phone per stall; most likes wins. */
export const CUSTOMER_CHOICE = {
  slug: 'people-choice',
  name: 'People Choice Award',
  description: 'Visitors tap “I like it” or “Not for me” on a stall’s page. The stall with the most likes wins.',
};

/** Decided by social media: the committee enters each group's likes and shares. */
export const VIRAL_VIDEO = {
  slug: 'viral-video',
  name: 'Most Popular & Viral Video Marketing',
  description: 'The marketing video with the most likes and shares on social media. The committee enters the counts.',
};

/** All nine categories in the order they are announced, for public pages. */
export const CATEGORIES: { slug: string; name: string; how: string; places: number; marks?: number }[] = [
  { slug: 'outstanding-stall', name: 'Outstanding Stall', how: 'Overall total of the stall elements, jury and customers', places: 3, marks: 50 },
  { slug: 'clean-charming', name: 'Clean and Charming Stall', how: 'Place element, jury and customers', places: 3, marks: 10 },
  { slug: 'brilliant-promotions', name: 'Brilliant Stall Promotions', how: 'Promotion element, jury and customers', places: 3, marks: 10 },
  { slug: 'hottest-product', name: 'Hottest Product', how: 'Product and Price elements, jury and customers', places: 3, marks: 20 },
  { slug: 'superb-service', name: 'Superb Customer Service', how: 'Customer Service element, jury and customers', places: 3, marks: 10 },
  { slug: 'video-marketing', name: 'Impressive Video Marketing', how: 'Jury only', places: 3, marks: 25 },
  { slug: 'business-pitch', name: 'Best Business Pitch with Innovation Element', how: 'Jury only', places: 3, marks: 15 },
  { slug: 'viral-video', name: 'Most Popular & Viral Video Marketing', how: 'Likes and shares on social media', places: 1 },
  { slug: 'people-choice', name: 'People Choice Award', how: 'Most votes from customers', places: 1 },
];

/** Panel of judges, from the event proposal (Lampiran 3). Preloaded as switched-off accounts. */
export const JUDGE_PANEL: string[] = [
  'Prof. Madya Dr Noorhaniza binti Wahid',
  'Dr Rahayu binti A.Hamid',
  'Dr Norhanifah binti Murli',
  'Dr Che Samihah binti Che Dalim',
  'En. Muhamad Fakri bin Othman',
  'Dr Nur Arifin bin Mohd Zin',
  'Dr Mohamad Zanes bin Shahid',
  'Dr Mohamad Hamdi Irwan bin Hamzah',
  'PM Dr Noraini binti Ibrahim',
  'Puan Norhanim binti Selamat',
  'Dr Shahdatunnaim binti Azmi',
  'Dr Mazidah binti Rejab',
  'Dr Rabatul Aduni binti Sulaiman',
  'Dr Nurezayana binti Zainal',
  'Puan Norlida binti Hassan',
  'Dr Yana Mazwin binti Mohmad Hassim',
  'Prof Madya Dr Isredza Rahmi binti Hamid',
  'Ts. Dr Suziyanti binti Marjudi Hassan',
  'Dr Radiah binti Mohamad',
  'Prof Madya Dr Shahreen binti Kassim',
  'Dr Nurul Hidayah binti Ab. Rahman',
  'Dr Mohamad Firdaus bin Ab Aziz',
  'Pn Ruhaya binti Ab Aziz',
  'Pn Rozlini binti Mohamed',
  'Dr Norhamreeza binti Abdul Hamid',
  'Puan Zuraida binti Bosri',
  'Dr Mohamad Aizi bin Salamat',
  'En Muhammad Shukri bin Che Lah',
  'En Khairul Amin bin Mohamad Sukri',
  'Ts Dr Mohd Norasri bin Ismail',
];

/** Judging and adjudication unit (Lampiran 2). Preloaded as switched-off admin accounts. */
export const JUDGING_UNIT: string[] = [
  'Dr Ezak Fadzrin bin Ahmad Shaubari',
  'Ts Dr Mohd Amin bin Mohd Yunus',
  'Ts Dr Deden Witarsyah',
];

/** Placeholder emails end with this; the admin console flags them until replaced. */
export const PENDING_EMAIL_DOMAIN = 'pending.leed26.local';

export function pendingEmail(prefix: string, n: number): string {
  return `${prefix}${String(n).padStart(2, '0')}@${PENDING_EMAIL_DOMAIN}`;
}
