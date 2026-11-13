// The LEED logo with a little life: it floats, a shine sweeps across it now and then,
// and on the loading screen two lights run around its outline like a spinner.

/** Outline of public/brand/leed-logo.webp (1040 x 700), traced about 35 px outside the artwork. */
const OUTLINE =
  'M941 -2Q936 -13 930 -18Q923 -24 915 -27Q907 -30 896 -30Q886 -30 822 -22Q757 -14 745 -10Q733 -6 722 3Q711 12 702 15Q694 18 684 17Q674 16 656 6Q639 -4 628 -6Q617 -9 542 2Q467 12 457 12Q447 11 432 3Q417 -5 406 -6Q395 -7 388 -4Q381 -2 368 10Q355 22 340 30Q326 38 311 54Q296 69 288 72Q279 75 262 75Q244 75 234 80Q225 86 212 104Q200 123 188 136Q176 148 162 190Q147 232 142 238Q136 244 108 264Q80 284 72 295Q65 306 60 316Q56 325 55 330Q54 336 58 354Q62 372 62 378Q61 383 58 390Q56 396 49 406Q42 417 38 428Q34 440 34 454Q33 468 36 478Q38 488 45 500Q52 511 67 526Q82 542 84 550Q87 558 87 568Q87 577 88 583Q90 589 94 594Q97 600 107 610Q117 619 120 626Q124 632 125 640Q126 649 122 664Q119 680 120 687Q122 694 126 700Q129 706 136 712Q144 719 150 722Q157 726 171 727Q185 728 274 714Q364 701 374 701Q385 701 399 706Q413 711 424 711Q436 711 501 704Q566 697 676 688Q787 679 798 677Q808 675 814 671Q821 667 826 661Q831 655 842 635Q853 615 859 608Q865 602 882 595Q899 588 914 576Q929 565 942 543Q955 521 960 510Q964 500 964 494Q965 488 962 475Q959 462 960 446Q962 429 958 410Q953 391 956 382Q958 374 968 362Q978 349 984 340Q989 330 992 318Q996 307 996 294Q997 282 994 270Q992 259 987 249Q982 239 971 227Q960 215 946 204Q932 194 928 186Q924 177 924 172Q923 168 925 160Q927 152 937 139Q947 126 950 117Q953 108 952 100Q952 91 947 80Q942 70 940 63Q939 56 942 42Q946 27 946 18Q946 8 941 -2Z';

export default function AnimatedLogo({
  ring = false,
  alt = 'LEED 26',
  className,
  priority = false,
}: {
  /** Run lights around the outline (loading screen). */
  ring?: boolean;
  alt?: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <span className={`alogo${ring ? ' alogo--ring' : ''}${className ? ` ${className}` : ''}`}>
      <span className="alogo-float">
        {ring && (
          <svg className="alogo-ring" viewBox="-60 -60 1160 820" aria-hidden="true" focusable="false">
            <path className="alogo-track" d={OUTLINE} />
            <path className="alogo-run" d={OUTLINE} pathLength={100} />
            <path className="alogo-run alogo-run--2" d={OUTLINE} pathLength={100} />
          </svg>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/leed-logo.webp" width={1040} height={700} alt={alt} fetchPriority={priority ? 'high' : undefined} />
        <span className="alogo-shine" aria-hidden="true" />
      </span>
    </span>
  );
}
