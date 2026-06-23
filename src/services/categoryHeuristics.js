function suggestCategory(book, categories) {
  if (!categories || categories.length === 0) return null;

  const title = (book.title || '').toLowerCase();
  const author = (book.author || '').toLowerCase();
  const isbn = (book.isbn || '').toLowerCase();
  const description = (book.description || '').toLowerCase();
  const tags = (book.tags || '').toLowerCase();
  const currentCategory = (book.category_name || '').toLowerCase();

  const rules = {
    'Computer Science': ['computer', 'programming', 'code', 'software', 'algorithm', 'data structure', 'python', 'java', 'javascript', 'c++', 'developer', 'coding', 'operating system', 'database', 'network'],
    'Artificial Intelligence': ['ai', 'artificial intelligence', 'machine learning', 'deep learning', 'neural network', 'data science', 'nlp'],
    'Business': ['business', 'management', 'startup', 'entrepreneur', 'marketing', 'leadership', 'strategy', 'corporate'],
    'Finance': ['finance', 'investing', 'money', 'economics', 'stock', 'wealth', 'trading', 'financial'],
    'Psychology': ['psychology', 'mind', 'behavior', 'cognitive', 'brain', 'mental'],
    'Engineering': ['engineering', 'mechanics', 'electronics', 'civil', 'thermodynamics', 'manufacturing'],
    'UPSC': ['upsc', 'ias', 'ips', 'civil services', 'polity', 'indian history', 'geography of india'],
    'Science & Technology': ['science', 'physics', 'chemistry', 'biology', 'technology', 'innovation', 'scientific'],
    'History': ['history', 'historical', 'war', 'empire', 'ancient', 'world war'],
    'Children\'s Books': ['children', 'kids', 'picture book', 'toddler', 'nursery', 'fairy tale'],
    'Comics & Manga': ['comic', 'manga', 'graphic novel', 'anime', 'superhero'],
    'Self-Help': ['self help', 'self-help', 'improvement', 'habit', 'success', 'motivation', 'productivity'],
    'Motivation': ['motivation', 'inspire', 'success', 'goal'],
    'Productivity': ['productivity', 'habit', 'time management', 'focus', 'deep work'],
    'Academic': ['textbook', 'academic', 'syllabus', 'exam', 'university', 'college'],
    'Classics': ['classic', 'literature', 'novel', 'jane austen', 'charles dickens', 'shakespeare'],
    'Fantasy': ['fantasy', 'magic', 'dragon', 'wizard', 'witch', 'epic', 'sword'],
    'Geography & Travel': ['geography', 'travel', 'guide', 'map', 'world', 'exploration'],
    'Animals & Nature': ['animal', 'nature', 'wildlife', 'plant', 'bird', 'earth'],
    'Biography': ['biography', 'memoir', 'autobiography', 'life story']
  };

  let bestMatch = null;
  let maxScore = 0;

  for (const cat of categories) {
    const catNameLower = cat.name.toLowerCase();
    let score = 0;

    // Direct category name check in title/tags/description
    if (title.includes(catNameLower)) {
      score += 45;
    }
    if (tags.includes(catNameLower)) {
      score += 35;
    }
    if (description.includes(catNameLower)) {
      score += 20;
    }
    if (author.includes(catNameLower)) {
      score += 15;
    }
    if (currentCategory.includes(catNameLower)) {
      score += 10;
    }

    const keywords = rules[cat.name] || [];
    for (const kw of keywords) {
      const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?<![a-zA-Z0-9_])${escapedKw}(?![a-zA-Z0-9_])`, 'gi');
      
      // Title matches (highest keyword weight)
      const titleMatches = title.match(regex);
      if (titleMatches) {
        score += 30 + (titleMatches.length - 1) * 10;
      }

      // Keyword tags matches
      const tagMatches = tags.match(regex);
      if (tagMatches) {
        score += 25 + (tagMatches.length - 1) * 5;
      }

      // Description matches
      const descMatches = description.match(regex);
      if (descMatches) {
        score += 15 + (descMatches.length - 1) * 5;
      }

      // Author matches
      const authMatches = author.match(regex);
      if (authMatches) {
        score += 10;
      }

      // ISBN matches (simple hint matching just in case isbn has something)
      if (isbn && isbn.includes(kw)) {
        score += 5;
      }
    }

    // Boost if current category is the one being evaluated
    if (cat.id === book.category_id || catNameLower === currentCategory) {
      score += 20; // Bias towards maintaining correct status quo unless strong contradiction
    }

    if (score > maxScore) {
      maxScore = score;
      bestMatch = cat;
    }
  }

  if (bestMatch && maxScore > 20) {
    // Confidence formula: base 35% + min(65%, maxScore * 0.5)
    let confidence = Math.min(100, Math.round(35 + (maxScore * 0.5)));
    
    return {
      categoryId: bestMatch.id,
      categoryName: bestMatch.name,
      confidence: confidence
    };
  }

  return null;
}

module.exports = {
  suggestCategory
};
