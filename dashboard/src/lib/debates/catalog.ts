// ── The canon: hand-authored starter debates ─────────────────────────────────
// A fixed set of marquee questions so the crowd has something great to argue
// about on day one (the "hand-authored canon first" decision). Each has a real
// roster with editorial seeds (the pre-vote favorite order), a storyline the
// host expands on, and a per-subject "case for". User- and host-proposed
// debates layer on top of this later; these stay as the evergreen spine.
//
// Seeds are opinions on purpose — they're the prior the crowd corrects. The
// point of the product is the tension between this seed order and where the
// crowd (and you) actually land.

import type { Debate } from './types';

export const DEBATES: Debate[] = [
  {
    id: 'nba-goat',
    slug: 'nba-goat',
    category: 'NBA',
    question: 'Who is the NBA GOAT?',
    hook: 'Six rings and a perfect Finals record, or the most complete résumé the game has seen?',
    featured: true,
    published: 'Jul 2026',
    kind: 'pairwise',
    storyline: `The greatest-of-all-time argument in basketball never really ends — it just changes weapons. For a generation it was settled: **Michael Jordan**, six-for-six in the Finals, never let it get to a Game 7, the closer's closer. Then **LeBron James** kept playing, and playing, and the counting stats stopped being arguable — most points in league history, top-of-the-board in almost everything else, four titles across three franchises.

So which case wins? The **peak** argument favors Jordan: nobody has matched that Finals perfection or that killer aura. The **résumé** argument favors LeBron: longevity *is* a skill, and no one has been elite for this long. **Kareem** has the all-time scoring pedigree and six rings of his own; **Bill Russell** has eleven championships and a claim the ring-counters can't dismiss; **Magic** and **Bird** dragged the league into its golden era.

Cast your votes below. The crowd's order is live — and we'll tell you exactly where your take breaks from it.`,
    subjects: [
      { id: 'michael-jordan', name: 'Michael Jordan', subtitle: 'Bulls · 1984–2003', seed: 1, blurb: '6–0 in the Finals, 6 Finals MVPs, the standard every closer is measured against.', facts: ['6× NBA champion', '6× Finals MVP', '5× MVP', '10× scoring champ'] },
      { id: 'lebron-james', name: 'LeBron James', subtitle: 'Multiple · 2003–present', seed: 2, blurb: 'All-time leading scorer with the most complete résumé the game has produced.', facts: ['All-time points leader', '4× champion', '4× Finals MVP', '20+ All-NBA'] },
      { id: 'kareem-abdul-jabbar', name: 'Kareem Abdul-Jabbar', subtitle: 'Bucks / Lakers · 1969–1989', seed: 3, blurb: 'The skyhook, six titles, and a scoring record that stood for 39 years.', facts: ['6× champion', '6× MVP', '19× All-Star'] },
      { id: 'bill-russell', name: 'Bill Russell', subtitle: 'Celtics · 1956–1969', seed: 4, blurb: 'Eleven championships in thirteen seasons — the ultimate winner.', facts: ['11× champion', '5× MVP', 'Defensive icon'] },
      { id: 'magic-johnson', name: 'Magic Johnson', subtitle: 'Lakers · 1979–1996', seed: 5, blurb: 'A 6\'9" point guard who redefined the position and won five titles.', facts: ['5× champion', '3× MVP', '3× Finals MVP'] },
      { id: 'larry-bird', name: 'Larry Bird', subtitle: 'Celtics · 1979–1992', seed: 6, blurb: 'Three straight MVPs and the rivalry that saved the league.', facts: ['3× champion', '3× MVP', '2× Finals MVP'] },
      { id: 'kobe-bryant', name: 'Kobe Bryant', subtitle: 'Lakers · 1996–2016', seed: 7, blurb: 'Five rings, the Mamba mentality, and the closest stylistic heir to Jordan.', facts: ['5× champion', '2× Finals MVP', '1× MVP', '81-point game'] },
      { id: 'wilt-chamberlain', name: 'Wilt Chamberlain', subtitle: '1959–1973', seed: 8, blurb: 'The most physically dominant statistical outlier the game has ever seen.', facts: ['100-point game', '50.4 PPG season', '4× MVP'] },
    ],
  },
  {
    id: 'nfl-goat-qb',
    slug: 'nfl-goat-qb',
    category: 'NFL',
    question: 'Who is the greatest QB of all time?',
    hook: 'Seven rings settle it — or do the purists still have a case?',
    featured: true,
    published: 'Jul 2026',
    kind: 'pairwise',
    storyline: `**Tom Brady** has seven Super Bowl rings. For a lot of people that's the whole conversation — more championships than any *franchise*, across two decades and two teams. But greatness at quarterback has always been argued on more than one axis.

The **arm-talent** camp points to **Patrick Mahomes**, already the most gifted thrower most have ever seen and stacking rings at a frightening pace. The **peak-genius** camp never left **Joe Montana** (4–0 in Super Bowls) or **Peyton Manning** (the most cerebral passer of his era). And **Aaron Rodgers** has a highlight reel of throws no one else could make.

Rings, peak, or pure talent — how do you weigh them? Vote it out.`,
    subjects: [
      { id: 'tom-brady', name: 'Tom Brady', subtitle: 'Patriots / Buccaneers', seed: 1, blurb: 'Seven Super Bowl titles — more than any franchise.', facts: ['7× Super Bowl champ', '5× SB MVP', '3× league MVP'] },
      { id: 'patrick-mahomes', name: 'Patrick Mahomes', subtitle: 'Chiefs', seed: 2, blurb: 'The most talented thrower of his generation, already a dynasty.', facts: ['Multiple SB titles', 'Multiple SB MVPs', 'League MVP'] },
      { id: 'joe-montana', name: 'Joe Montana', subtitle: '49ers / Chiefs', seed: 3, blurb: 'A perfect 4–0 in Super Bowls and the original cool-under-pressure icon.', facts: ['4× Super Bowl champ', '3× SB MVP', '2× league MVP'] },
      { id: 'peyton-manning', name: 'Peyton Manning', subtitle: 'Colts / Broncos', seed: 4, blurb: 'The most cerebral passer ever and a five-time MVP.', facts: ['5× league MVP', '2× Super Bowl champ', 'Single-season TD record'] },
      { id: 'aaron-rodgers', name: 'Aaron Rodgers', subtitle: 'Packers / Jets', seed: 5, blurb: 'Arguably the most naturally gifted passer of the modern era.', facts: ['4× league MVP', 'Super Bowl champ', 'Best TD:INT ratio'] },
      { id: 'johnny-unitas', name: 'Johnny Unitas', subtitle: 'Colts', seed: 6, blurb: 'The prototype — defined the position for the modern era.', facts: ['3× champion', '3× MVP', '47-game TD streak'] },
      { id: 'drew-brees', name: 'Drew Brees', subtitle: 'Saints', seed: 7, blurb: 'A passing-record machine and a Super Bowl winner.', facts: ['Super Bowl champ + MVP', 'Passing yards record (former)'] },
    ],
  },
  {
    id: 'goat-athlete',
    slug: 'goat-athlete',
    category: 'Cross-Sport',
    question: 'Greatest athlete of all time — any sport?',
    hook: 'How do you compare a sprinter, a swimmer, and a boxer? You vote.',
    featured: true,
    published: 'Jul 2026',
    kind: 'pairwise',
    storyline: `This is the bar-argument to end all bar-arguments: strip away the sport and ask who is simply the **greatest athlete** who ever lived. There's no shared stat line here — only your gut and the crowd's.

**Michael Jordan** and **LeBron James** carry basketball. **Muhammad Ali** and **Serena Williams** are the two most dominant figures their sports have produced. **Usain Bolt** is the fastest human ever timed; **Michael Phelps** owns more Olympic gold than entire countries. **Wayne Gretzky** rewrote hockey's record book so thoroughly the numbers look like typos.

There's no right answer — that's the point. Where does your gut rank them, and how far from the crowd are you?`,
    subjects: [
      { id: 'muhammad-ali', name: 'Muhammad Ali', subtitle: 'Boxing', seed: 1, blurb: 'The Greatest — self-proclaimed and widely agreed.', facts: ['3× heavyweight champ', 'Olympic gold', 'Cultural icon'] },
      { id: 'michael-jordan-x', name: 'Michael Jordan', subtitle: 'Basketball', seed: 2, blurb: 'Global icon, six titles, unmatched competitive drive.', facts: ['6× NBA champ', '5× MVP', 'Olympic gold'] },
      { id: 'serena-williams', name: 'Serena Williams', subtitle: 'Tennis', seed: 3, blurb: '23 Grand Slam singles titles in the Open era.', facts: ['23 Grand Slams', '4× Olympic gold', 'Longevity at #1'] },
      { id: 'usain-bolt', name: 'Usain Bolt', subtitle: 'Track & Field', seed: 4, blurb: 'The fastest human ever timed — 9.58 in the 100m.', facts: ['8× Olympic gold', '100m & 200m WR', 'Never lost a major final'] },
      { id: 'michael-phelps', name: 'Michael Phelps', subtitle: 'Swimming', seed: 5, blurb: 'The most decorated Olympian in history.', facts: ['23 Olympic golds', '28 total medals'] },
      { id: 'wayne-gretzky', name: 'Wayne Gretzky', subtitle: 'Hockey', seed: 6, blurb: 'Holds or shares 60+ NHL records — "The Great One".', facts: ['4× Stanley Cup', '9× MVP', 'All-time points leader'] },
      { id: 'lebron-james-x', name: 'LeBron James', subtitle: 'Basketball', seed: 7, blurb: 'Two decades of elite dominance and durability.', facts: ['All-time scorer', '4× champ', 'Olympic gold'] },
    ],
  },
  {
    id: 'soccer-goat',
    slug: 'soccer-goat',
    category: 'Soccer',
    question: 'Messi or Ronaldo — and who else is in the room?',
    hook: 'The defining rivalry of a generation. Settle it.',
    published: 'Jul 2026',
    kind: 'pairwise',
    storyline: `Two decades, two aliens. **Lionel Messi** finally has the World Cup to sit beside the Ballons d'Or; **Cristiano Ronaldo** has the goals, the trophies across three leagues, and a longevity that refuses to quit.

But the "GOAT" room isn't just theirs. **Pelé** and **Diego Maradona** built the myth long before either of them — three World Cups for one, a single tournament of transcendence for the other. Vote your read, and see where the crowd stands on football's oldest argument.`,
    subjects: [
      { id: 'lionel-messi', name: 'Lionel Messi', subtitle: 'Argentina · Barcelona', seed: 1, blurb: 'A record haul of Ballons d\'Or, capped by the 2022 World Cup.', facts: ['8× Ballon d\'Or', 'World Cup winner', 'Most goals for one club'] },
      { id: 'cristiano-ronaldo', name: 'Cristiano Ronaldo', subtitle: 'Portugal · multiple', seed: 2, blurb: 'All-time leading goalscorer, titles in England, Spain and Italy.', facts: ['5× Ballon d\'Or', 'All-time top scorer', '5× Champions League'] },
      { id: 'pele', name: 'Pelé', subtitle: 'Brazil · Santos', seed: 3, blurb: 'Three World Cups and a claim to the throne that never fades.', facts: ['3× World Cup', '1000+ career goals'] },
      { id: 'diego-maradona', name: 'Diego Maradona', subtitle: 'Argentina · Napoli', seed: 4, blurb: 'The 1986 World Cup, arguably the greatest single-tournament run ever.', facts: ['World Cup winner', 'Goal of the Century'] },
    ],
  },
  {
    id: 'best-dunker',
    slug: 'best-dunker',
    category: 'NBA',
    question: 'Greatest in-game dunker ever?',
    hook: 'Not the contest — the ones who did it when it counted.',
    published: 'Jul 2026',
    kind: 'pairwise',
    storyline: `Dunk contests are theater. This is about the players whose in-game finishing made arenas gasp for real. **Vince Carter** is the consensus starting point — half-man, half-amazing. But **Shawn Kemp**, **Dominique Wilkins**, **Blake Griffin**, and a peak **LeBron** all have a case. Rank the rim-wreckers.`,
    subjects: [
      { id: 'vince-carter', name: 'Vince Carter', subtitle: 'Raptors et al.', seed: 1, blurb: 'The most spectacular in-game dunker most have ever seen.', facts: ['Iconic 2000 contest', 'Dunk over Weis'] },
      { id: 'dominique-wilkins', name: 'Dominique Wilkins', subtitle: 'Hawks', seed: 2, blurb: 'The Human Highlight Film.', facts: ['2× Dunk champ', 'Power + air'] },
      { id: 'shawn-kemp', name: 'Shawn Kemp', subtitle: 'Sonics', seed: 3, blurb: 'The Reign Man — violence at the rim.', facts: ['Lister poster', '6× All-Star'] },
      { id: 'blake-griffin', name: 'Blake Griffin', subtitle: 'Clippers', seed: 4, blurb: 'Lob City\'s finisher — a walking poster.', facts: ['Dunk champ', 'Over a car'] },
      { id: 'lebron-james-d', name: 'LeBron James', subtitle: 'Multiple', seed: 5, blurb: 'Freight-train transition dunks in traffic.', facts: ['Chase-down + finish', 'Peak athleticism'] },
      { id: 'julius-erving', name: 'Julius Erving', subtitle: 'Sixers / Nets', seed: 6, blurb: 'Dr. J invented the modern aerial vocabulary.', facts: ['Free-throw-line dunk', 'The baseline scoop'] },
    ],
  },
];

export function debateBySlug(slug: string): Debate | undefined {
  return DEBATES.find((d) => d.slug === slug);
}

export function debateById(id: string): Debate | undefined {
  return DEBATES.find((d) => d.id === id);
}

export const CATEGORIES: { value: 'ALL' | Debate['category']; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'NBA', label: 'NBA' },
  { value: 'NFL', label: 'NFL' },
  { value: 'Soccer', label: 'Soccer' },
  { value: 'Cross-Sport', label: 'Cross-Sport' },
];
