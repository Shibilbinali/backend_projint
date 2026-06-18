const pool = require('../config/db');
const { classifyBookWithGemini } = require('./geminiService');

// Expanded Target Categories list
const TARGET_CATEGORIES = [
  "Manga",
  "Children's Story Books",
  "Children's Picture Books",
  "Children's Fiction",
  "History",
  "Science & Technology",
  "Geography & Travel",
  "Animals & Nature",
  "Classics"
];

// General keyword rules for classification fallbacks
const RULES = {
  "Manga": {
    keywords: [
      /\bmanga\b/i, /\banime\b/i, /\bcomics?\b/i, /\bgraphic novels?\b/i, /\bshonen\b/i,
      /\bnaruto\b/i, /\bone piece\b/i, /\btitan\b/i, /\bdemon slayer\b/i, /\bdeath note\b/i,
      /\bhero academia\b/i, /\bdragon ball\b/i
    ],
    authors: [
      "Masashi Kishimoto", "Eiichiro Oda", "Hajime Isayama", "Koyoharu Gotouge",
      "Tsugumi Ohba", "Kohei Horikoshi", "Akira Toriyama"
    ]
  },
  "Children's Story Books": {
    keywords: [
      /\bstorybooks?\b/i, /\bbedtime stories\b/i, /\bvelveteen rabbit\b/i, /\bwinnie-the-pooh\b/i,
      /\bpeter rabbit\b/i, /\bbenjamin bunny\b/i, /\bwind in the willows\b/i, /\bblack beauty\b/i,
      /\bchildren's story\b/i, /\btales? for children\b/i
    ],
    authors: ["Margery Williams", "A.A. Milne", "Beatrix Potter", "Johanna Spyri", "Kenneth Grahame", "Anna Sewell"]
  },
  "Children's Picture Books": {
    keywords: [
      /\bpicture books?\b/i, /\billustrated by\b/i, /\billustrations\b/i, /\bvery hungry caterpillar\b/i,
      /\bgoodnight moon\b/i, /\bbrown bear\b/i, /\bcorduroy\b/i, /\bcurious george\b/i, /\bsnowy day\b/i,
      /\bmadeline\b/i, /\bhighly illustrated\b/i, /\bcolored drawings\b/i
    ],
    authors: ["Eric Carle", "Bill Martin Jr.", "Don Freeman", "H.A. Rey", "Ezra Jack Keats", "Ludwig Bemelmans"]
  },
  "Children's Fiction": {
    keywords: [
      /\bcharlotte's web\b/i, /\bmatilda\b/i, /\bsecret garden\b/i, /\bwizard of oz\b/i,
      /\banne of green gables\b/i, /\blittle prince\b/i, /\balice's adventures\b/i,
      /\bchildren's fiction\b/i, /\bkids fiction\b/i, /\bjuvenile fiction\b/i
    ],
    authors: ["E.B. White", "Roald Dahl", "Frances Hodgson Burnett", "L. Frank Baum", "L.M. Montgomery", "Antoine de Saint-Exupéry", "Lewis Carroll"]
  },
  "History": {
    keywords: [
      /\bhistory\b/i, /\bancient egypt\b/i, /\bancient greece\b/i, /\bworld war\b/i,
      /\bhistory of\b/i, /\bhistorical\b/i, /\bchronicles\b/i, /\bpharaohs\b/i, /\bcolonization\b/i,
      /\bdynasties\b/i
    ],
    authors: ["Captivating History", "H.G. Wells", "Hendrik van Loon", "History Hourly"]
  },
  "Science & Technology": {
    keywords: [
      /\bscience\b/i, /\btechnology\b/i, /\bphysics\b/i, /\bcosmology\b/i, /\bastronomy\b/i,
      /\bcosmos\b/i, /\brief history of time\b/i, /\brobotics\b/i, /\bcoding\b/i, /\bprogramming\b/i,
      /\bscientific\b/i, /\bexperiments\b/i, /\bscratch coding\b/i, /\bspace bus\b/i
    ],
    authors: ["Stephen Hawking", "Carl Sagan", "Joanna Cole", "Bob Barlow", "Louie Stowell"]
  },
  "Geography & Travel": {
    keywords: [
      /\bgeography\b/i, /\batlas\b/i, /\btravel\b/i, /\baround the world\b/i, /\bcountries of the world\b/i,
      /\bmaps?\b/i, /\bglobe\b/i, /\bnations\b/i
    ],
    authors: ["Jules Verne", "National Geographic", "NG Kids"]
  },
  "Animals & Nature": {
    keywords: [
      /\banimals\b/i, /\bnature\b/i, /\bwildlife\b/i, /\bconservation\b/i, /\bforests?\b/i,
      /\bfauna\b/i, /\bhabitats?\b/i
    ],
    authors: ["NG Kids", "National Geographic Kids", "Wildlife Collection"]
  },
  "Classics": {
    keywords: [
      /\bclassics?\b/i, /\btreasure island\b/i, /\brobinson crusoe\b/i, /\bgulliver's travels\b/i,
      /\btom sawyer\b/i, /\blittle women\b/i, /\bliterary classic\b/i, /\btimeless masterpieces?\b/i
    ],
    authors: ["Robert Louis Stevenson", "Daniel Defoe", "Jonathan Swift", "Mark Twain", "Louisa May Alcott"]
  }
};

// Title overrides list mapping books exactly to their target categories
const OVERRIDES = [
  // Manga
  { keys: ["naruto"], primary: "Manga" },
  { keys: ["one piece"], primary: "Manga" },
  { keys: ["attack on titan"], primary: "Manga" },
  { keys: ["demon slayer"], primary: "Manga" },
  { keys: ["death note"], primary: "Manga" },
  { keys: ["my hero academia"], primary: "Manga" },
  { keys: ["dragon ball"], primary: "Manga" },

  // Children's Story Books
  { keys: ["velveteen rabbit"], primary: "Children's Story Books" },
  { keys: ["winnie-the-pooh"], primary: "Children's Story Books" },
  { keys: ["peter rabbit"], primary: "Children's Story Books" },
  { keys: ["benjamin bunny"], primary: "Children's Story Books" },
  { keys: ["heidi"], primary: "Children's Story Books" },
  { keys: ["wind in the willows"], primary: "Children's Story Books" },
  { keys: ["black beauty"], primary: "Children's Story Books" },

  // Children's Picture Books
  { keys: ["goodnight moon"], primary: "Children's Picture Books" },
  { keys: ["brown bear"], primary: "Children's Picture Books" },
  { keys: ["hungry caterpillar"], primary: "Children's Picture Books" },
  { keys: ["corduroy"], primary: "Children's Picture Books" },
  { keys: ["curious george"], primary: "Children's Picture Books" },
  { keys: ["snowy day"], primary: "Children's Picture Books" },
  { keys: ["madeline"], primary: "Children's Picture Books" },

  // Children's Fiction
  { keys: ["charlotte's web"], primary: "Children's Fiction" },
  { keys: ["matilda"], primary: "Children's Fiction" },
  { keys: ["secret garden"], primary: "Children's Fiction" },
  { keys: ["wizard of oz"], primary: "Children's Fiction" },
  { keys: ["green gables"], primary: "Children's Fiction" },
  { keys: ["little prince"], primary: "Children's Fiction" },
  { keys: ["alice's adventures", "alice in wonderland"], primary: "Children's Fiction" },

  // History
  { keys: ["history of the world"], primary: "History" },
  { keys: ["story of mankind"], primary: "History" },
  { keys: ["ancient egypt for kids"], primary: "History" },
  { keys: ["ancient greece for kids"], primary: "History" },
  { keys: ["world war i overview"], primary: "History" },
  { keys: ["world war ii overview"], primary: "History" },
  { keys: ["history of india"], primary: "History" },

  // Science & Tech
  { keys: ["history of time"], primary: "Science & Technology" },
  { keys: ["cosmos"], primary: "Science & Technology" },
  { keys: ["magic school bus"], primary: "Science & Technology" },
  { keys: ["science books", "science kids"], primary: "Science & Technology" },
  { keys: ["robotics for kids"], primary: "Science & Technology" },
  { keys: ["coding for beginners"], primary: "Science & Technology" },

  // Geography & Travel
  { keys: ["around the world in 80 days", "around the world in eighty days"], primary: "Geography & Travel" },
  { keys: ["atlas"], primary: "Geography & Travel" },
  { keys: ["countries of the world"], primary: "Geography & Travel" },

  // Animals & Nature
  { keys: ["ng kids animals", "animals kids"], primary: "Animals & Nature" },
  { keys: ["animal stories collection"], primary: "Animals & Nature" },
  { keys: ["wildlife adventures"], primary: "Animals & Nature" },

  // Classics
  { keys: ["treasure island"], primary: "Classics" },
  { keys: ["robinson crusoe"], primary: "Classics" },
  { keys: ["gulliver"], primary: "Classics" },
  { keys: ["tom sawyer"], primary: "Classics" },
  { keys: ["little women"], primary: "Classics" }
];

/**
 * Classifies a book based on metadata
 */
async function classifyBook(book) {
  // Try AI-based classification if GEMINI_API_KEY is configured
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '' && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
    try {
      console.log(`[Category Service] Attempting AI-based classification for: "${book.title}"`);
      const aiResult = await classifyBookWithGemini(book);
      console.log(`[Category Service] Gemini classified: "${book.title}" -> ${aiResult.primaryCategoryName}`);
      return aiResult;
    } catch (err) {
      console.warn(`[Category Service] Gemini AI classification failed (${err.message}). Falling back to rule-based classifier.`);
    }
  }

  const title = (book.title || "").toLowerCase();
  const author = book.author || "";
  const description = book.description || "";
  const publisher = book.publisher || "";

  // 1. Check overrides first
  for (const override of OVERRIDES) {
    if (override.keys.some(k => title.includes(k))) {
      return {
        primaryCategoryName: override.primary,
        secondaryCategoryNames: [],
        confidence: 1.0,
        needsManualReview: false,
        notes: `Matched explicit override rule for "${override.primary}".`
      };
    }
  }

  // 2. Score each category
  const scores = {};
  for (const cat of TARGET_CATEGORIES) {
    scores[cat] = 0;
  }

  for (const [catName, rules] of Object.entries(RULES)) {
    // Keyword matches in Title (weight = 2)
    if (rules.keywords) {
      for (const regex of rules.keywords) {
        if (regex.test(title)) {
          scores[catName] += 2.0;
        }
        if (regex.test(description)) {
          scores[catName] += 0.8;
        }
      }
    }

    // Author matching (weight = 2)
    if (rules.authors) {
      for (const auth of rules.authors) {
        if (author.toLowerCase().includes(auth.toLowerCase())) {
          scores[catName] += 2.0;
        }
      }
    }
  }

  // Find the top categories
  const sortedScores = Object.entries(scores)
    .sort((a, b) => b[1] - a[1]);

  const topCategory = sortedScores[0][0];
  const topScore = sortedScores[0][1];
  const runnerUpScore = sortedScores[1] ? sortedScores[1][1] : 0;

  // Primary category choice
  let primaryCategoryName = "Classics"; // Fallback default
  let confidence = 0.5;
  let needsManualReview = true;
  let notes = "";

  if (topScore > 0) {
    primaryCategoryName = topCategory;
    const scoreGap = topScore - runnerUpScore;
    if (topScore >= 2.0 && scoreGap >= 1.0) {
      confidence = 1.0;
      needsManualReview = false;
      notes = `High confidence match based on metadata indicators. Score gap: ${scoreGap.toFixed(1)}.`;
    } else {
      confidence = 0.6;
      needsManualReview = true;
      notes = `Potential conflict: narrow margin (${scoreGap.toFixed(1)}) between top choices.`;
    }
  } else {
    primaryCategoryName = "Classics";
    confidence = 0.2;
    needsManualReview = true;
    notes = "Low confidence: No indicators found. Defaulted to Classics.";
  }

  const secondaryCategoryNames = [];
  for (const [catName, score] of Object.entries(scores)) {
    if (catName !== primaryCategoryName && score >= 0.8) {
      secondaryCategoryNames.push(catName);
    }
  }

  return {
    primaryCategoryName,
    secondaryCategoryNames,
    confidence,
    needsManualReview,
    notes
  };
}

module.exports = {
  classifyBook,
  TARGET_CATEGORIES
};
