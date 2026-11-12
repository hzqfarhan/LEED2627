// The five LEED 26 awards, from the prize list in the event proposal
// (Kertas Kerja Karnival Keusahawanan LEED FSKTM 2026, Lampiran 1).
// db/seed.sql inserts the same competitions and criteria; keep the two in step.
//
// Rubrics for Best Stall, Best Marketing Video and Business Pitching Idea are the BIT21603
// Component B, D and C rubrics, as agreed with the course coordinator. Customer service is
// marked in class only; at LEED it becomes the public Customer Choice Award (see below).
// Innovation Product has no rubric yet, so its criteria are marked "Provisional".

export interface CriterionDef {
  name: string;
  description: string;
  /** Full marks for this criterion. Level 5 earns all of them, level 0 none. */
  marks: number;
  /** What each level means, from level 0 to level 5. */
  levels: [string, string, string, string, string, string];
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

const c = (name: string, description: string, marks: number, levels: CriterionDef['levels']): CriterionDef => ({
  name,
  description,
  marks,
  levels,
});

export const AWARDS: AwardDef[] = [
  {
    slug: 'stall',
    name: 'Best Stall',
    description:
      'Judged at the stall on 9 December, 12:00 pm to 5:00 pm. Rubric: BIT21603 Component B (Practical Implementation); customer service is marked in class, not here.',
    criteria: [
      c('Product / Service', 'Creativity, quality and attractive presentation.', 4, [
        'No implementation.',
        'Very poor quality, messy.',
        'Poor quality, weak presentation.',
        'Adequate quality and presentation.',
        'Creative, good quality, neat presentation.',
        'Highly creative, superior quality, attractive.',
      ]),
      c('Price Strategy', 'Competitive pricing grounded in at least 2 competitor benchmarks.', 5, [
        'No implementation.',
        'Inappropriate pricing model.',
        'Overpriced, or no competitors compared.',
        'Reasonable, minimal competitor reference.',
        'Competitive, 1 to 2 competitor comparisons.',
        'Highly competitive, affordable, 2 or more competitors compared.',
      ]),
      c('Place (Targeting)', 'Strategic alignment between target market and channels.', 4, [
        'No implementation.',
        'Incorrect or missing audience definition.',
        'Vague audience; mismatched platform.',
        'Target audience identified; standard choice.',
        'Clear target audience; strong channel rationale.',
        'Deep, data-backed audience insight; channel aligned.',
      ]),
      c('Promotion', 'Visual appeal, campaign reach and promotional engagement.', 5, [
        'No implementation.',
        'Poor visuals; no promotional effort.',
        'Weak visuals; ineffective campaign.',
        'Acceptable visuals; predictable campaign.',
        'Attractive visuals and effective campaign.',
        'Attractive visuals, high reach and engagement.',
      ]),
    ],
  },
  {
    slug: 'video-marketing',
    name: 'Best Marketing Video',
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
    slug: 'innovation-product',
    name: 'Innovation Product',
    description: 'Provisional rubric: no rubric was given for this award yet. Replace these criteria before judging opens.',
    criteria: [
      c('Novelty', 'Provisional. How original the product or service is.', 5, [
        'No submission.',
        'Copies an existing product with no change.',
        'Small change to an existing product.',
        'Some original elements.',
        'Clearly original idea with a distinct twist.',
        'Highly original; nothing like it on campus.',
      ]),
      c('Use of Technology', 'Provisional. How well technology is used in the product, its making or its selling.', 5, [
        'No submission.',
        'No technology involved.',
        'Technology mentioned but barely used.',
        'Basic, sensible use of technology.',
        'Good technology use that adds value.',
        'Technology is central and well executed.',
      ]),
      c('Problem Solved', 'Provisional. How clearly it meets a real need for its customers.', 5, [
        'No submission.',
        'No clear need.',
        'Weak or unclear need.',
        'A real but minor need.',
        'A clear need, well addressed.',
        'An important need, convincingly solved.',
      ]),
      c('Market Potential', 'Provisional. How likely it is to sell beyond LEED.', 5, [
        'No submission.',
        'No market beyond the event.',
        'Very small or unclear market.',
        'Some market, limited growth.',
        'Clear market with growth potential.',
        'Strong, scalable market opportunity.',
      ]),
    ],
  },
  {
    slug: 'business-pitch',
    name: 'Business Pitching Idea',
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

/** Public award decided by visitors: one like or dislike per phone per stall; most likes wins. */
export const CUSTOMER_CHOICE = {
  name: 'Customer Choice Award',
  description: 'Visitors tap “I like it” or “Not for me” on a stall’s page. The stall with the most likes wins.',
};

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
