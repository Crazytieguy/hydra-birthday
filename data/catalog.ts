// The session catalog, transcribed from Yoav's kickoff message. Seeded by
// `bun run seed` (convex/catalog.ts), create-only: entries whose `key`
// already exists in the DB are never touched again, so post-seed edits happen
// through the admin UI. `key` is the immutable identity — never rename one.
// Descriptions are the facilitators' own words (obvious typos fixed, pending
// Yoav's copy review); sessions whose descriptions are still being drafted or
// waiting on their facilitator ship title-only.

export type CatalogEntry = {
  key: string
  title: string
  description?: string
  facilitatorNames: Array<string>
  needsFacilitator?: boolean
}

export const catalog: Array<CatalogEntry> = [
  {
    key: 'circling',
    title: 'Circling',
    facilitatorNames: ['Colin Belgard'],
    description: `Circling is the practice of paying exquisite attention to what it's like to be with each other, in real time.

While lots of things can happen in a circle: curiosity, confusion, awkwardness, tenderness, dissonance, humor; the content tends to matter less than the quality of attention that we bring. Taking the time to slow down and pay close attention to each other is invariably rewarding and enlivening.

This event will be facilitated in the AuthenticWorld/Integral Center style, which has been missing from the Bay Area for quite a few years. For those of you who have some experience with the practice, there's less of a focus on emotional intensity or vulnerability as ends unto themselves; the orientation is towards curiosity, epistemic humility, and actually trying to get someone's world.

About Colin

Colin has been practicing and training in circling and authentic relating since 2011 and has taught with Authentic World, the Authentic Man Program, the Integral Center, the Circling Institute, and Authentic Revolution. He has facilitated hundreds of circling and AR games nights across the country, and is particularly excited to bring this flavor back to the Bay Area.

Outside of events like this, he's coached leaders and executives since 2015 across hedge funds, startups, biotech, and academia on communication and building high performance teams.`,
  },
  {
    key: 'fusion-dance-class',
    title: 'Fusion Dance Class',
    facilitatorNames: ['Thor Kampefner'],
  },
  {
    key: 'shibari-class',
    title: 'Shibari Class',
    facilitatorNames: ['Clara Mcmahan'],
    description:
      'A class on the basics of shibari, emphasizing rope handling and connection, with relatively few technical elements. Default partner + role switching, though people are welcome to opt out of switching if they prefer',
  },
  {
    key: 'boudoir-life-drawing',
    title: 'Boudoir Life Drawing',
    facilitatorNames: [],
    needsFacilitator: true,
    description: 'Libi poses in lingerie and people draw or sculpt her',
  },
  {
    key: 'pdt-sign-language',
    title: 'Person Do Thing: Sign Language Edition',
    // Facilitator strongly suspected but not confirmed; linked once they are.
    facilitatorNames: [],
    description: `Come learn ASL via Person Do Thing!

Person Do Thing (https://persondothing.com/) is a wonderful game which teaches us that all human concepts can be described using just 33 simple words. It stands to reason, then, that you can 80/20 learning a new language by studying just these words.

American Sign Language is a beautifully fun language. Learning to sign is like spending your whole life illiterate, then finally learning to write—it's a whole new mode of communication. I'll teach you the 33 signs you need, then we can break into groups for some ASL PDT.`,
  },
  {
    key: 'pdt-toki-pona',
    title: 'Person Do Thing: Toki Pona Edition',
    facilitatorNames: [],
    needsFacilitator: true,
    // Description drafted in the copy artifact; lands here once approved.
  },
  {
    key: 'musical-theater-karaoke',
    title: 'Musical theater karaoke',
    facilitatorNames: ['Libi Soen'],
    description:
      "Come indulge Libi's deranged obsession with certain pieces of music (musical theater karaoke edition)",
  },
  {
    key: 'libi-dj-set-fusion-dance',
    title: 'Libi DJ Set Fusion Dance',
    facilitatorNames: ['Libi Soen'],
    description:
      "Come indulge Libi's deranged obsession with certain pieces of music (Dance edition)",
  },
  {
    key: 'dnd-one-shot',
    title: 'DND / role-playing one shot',
    facilitatorNames: ['Guy'],
    description: 'A vibey adventure with loose rules and epic heroism!',
  },
  {
    key: 'hamilton-hadestown-singalong',
    title: 'Hamilton/Hadestown screening singalong',
    facilitatorNames: ['Libi Soen'],
    description:
      'Libi leads us through the most dopaminergic singalong of the century',
  },
  {
    key: 'hanabi-tournament',
    title: 'Hanabi tournament',
    facilitatorNames: ['Guy', 'Yoav'],
    description:
      "Come play Hanabi, one of Yoav's favorite games! Hanabi is a cooperative card game where winning requires trusting each other: friendships are built and broken over this game. We may or may not find a way to make a competitive container for it",
  },
  {
    key: 'making-art',
    title: 'Making art',
    facilitatorNames: ['Nathaniel'],
  },
  {
    key: 'hot-seat',
    title: 'Hot seat',
    facilitatorNames: ['Libi Soen'],
    description:
      'Get to know each other more deeply by asking each other intrusive questions!',
  },
  {
    key: 'real-jam-session',
    title: 'REAL Jam Session (+ improvisation lesson)',
    facilitatorNames: ['Yoav'],
    description:
      "My biggest pet peeve is when people call something a \"Jam\" but it's actually a sing-along. I'll teach y'all to improvise, and then we'll have a REAL jam. Basic musicality needed, but not any jamming experience, instruments optional.",
  },
  {
    key: 'media-potluck',
    title: 'Media potluck',
    facilitatorNames: ['Yoav'],
    description:
      "I want to hear some of your favorite media, whether it's a song, a video, a short story, a game, or anything else! The only requirement is that it's something that really moved you in some way, intellectually or emotionally, and that it's under ~10 minutes.",
  },
  {
    key: 'librish-class',
    title: 'Librish Class',
    facilitatorNames: ['Libi Soen', 'Guy'],
    description:
      "Come learn an alien communication language! (Libi's associative concept world)",
  },
  {
    key: 'so-sad',
    title: 'So Sad 😭',
    facilitatorNames: ['Yoav'],
    description:
      "Let's be really sad together! We'll share some of the saddest stories from our lives and relive them together, or do a guided meditation on giving up and falling apart, or roleplay social disaster scenarios, or anything else we come up with that might make us sad. We'll come slightly sleep deprived, dressed in our ugliest clothes, the room will be a bit too cold, and some of us may be on an MDMA comedown. If you cry, your reward is ice cream and hot chocolate",
  },
  {
    key: 'anger-anti-management',
    title: 'Anger anti-management',
    facilitatorNames: ['Yoav'],
    description:
      "We'll take turns performing a specific exercise intended to elicit anger while others hold space. It was given to me by a coach/therapist type person once, and involves hitting a punching bag with a baseball bat (amongst other steps). Recommended for people with muted emotions that don't get angry even when they should, and NOT recommended for people that already get angry often",
  },
  {
    key: 'improv',
    title: 'Improv',
    facilitatorNames: ['Libi Soen', 'Guy'],
  },
  {
    key: 'twelve-levers-workshop',
    title: '12 Levers Workshop',
    facilitatorNames: ['Libi Soen'],
    description:
      'Bonding by practicing self help exercises together, based on the book 12 Levers.',
  },
  {
    key: 'sun-salutations-marathon',
    title: 'Sun Salutations marathon followed by a nourishing meal',
    facilitatorNames: ['Yoav'],
    description:
      "We'll spend 1-2 hours doing sun salutations (a basic sequence of yoga positions that involves your whole body), then have an extremely nourishing meal. Resting in shavasana (corpse pose) or child's pose when needed will be allowed and encouraged.",
  },
  {
    key: 'relationship-conflicts-sharing',
    title: 'Relationship conflicts sharing',
    facilitatorNames: ['Yoav'],
    description:
      "We'll share stories about the worst conflicts we had in our past relationships, talk about what we wish we had done differently, hear from others what it brings up in them and how they would have handled it",
  },
  {
    key: 'play-with-my-heart',
    title: 'Play with my heart: tryhard edition',
    facilitatorNames: ['Yoav'],
    description:
      "Evolution of an event I ran at summer camp and vibecamp: strapping a heart rate monitor to someone and trying to increase their heart rate by triggering an emotional response. This time, before getting to the heart rate monitor we'll start by hearing from everyone what they're passionate about, what they're anxious about, and try to tease out who might be a good partner for them",
  },
  {
    key: 'osho-meditation',
    title: 'Osho Kundalini or whirling meditation',
    facilitatorNames: ['Yoav'],
    // Description drafted in the copy artifact; lands here once approved.
  },
  {
    key: 'utopia-discussion',
    title: 'Utopia Discussion',
    facilitatorNames: ['Yoav'],
    description:
      "What would we *actually* want the world to look like post-ASI? We'll start with a lightly guided mind-opening meditation, then have a round of individual thinking, then cross-pollinate. The goal is to figure out each of our visions for our ideal life, unconstrained by technological or financial limits, then see if we can figure out a coherent shared vision all of us align with. Essentially trying to extrapolate our own volition (re CEV)",
  },
  {
    key: 'puzzle-game-playtesting',
    title: 'Puzzle game playtesting and screening',
    facilitatorNames: ['Libi Soen'],
    description:
      "Come solve a special indie puzzle video game made by Libi's childhood friend together",
  },
  {
    key: 'metta-meditation',
    title: 'Metta Meditation',
    facilitatorNames: ['Yoav'],
    // Description drafted in the copy artifact; lands here once approved.
  },
  {
    key: 'glosso-quizzes',
    title: 'Glosso quizzes',
    facilitatorNames: ['Libi Soen'],
    description: "Snoop on each other's Glosso quiz answers and reasoning",
  },
]

// Guards against silently losing an entry while editing this file.
export const CATALOG_COUNT = 28
if (catalog.length !== CATALOG_COUNT) {
  throw new Error(
    `catalog has ${catalog.length} entries, expected ${CATALOG_COUNT}`,
  )
}
const keys = new Set(catalog.map((entry) => entry.key))
if (keys.size !== catalog.length) {
  throw new Error('catalog keys must be unique')
}
