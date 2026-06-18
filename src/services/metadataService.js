const { retryFetch } = require('../utils/retryFetch');

const cache = new Map();

/**
 * Normalizes published dates into a year integer.
 */
function parsePublishedYear(dateStr) {
  if (!dateStr) return null;
  const match = dateStr.match(/\d{4}/);
  return match ? parseInt(match[0], 10) : null;
}

/**
 * Searches Google Books API.
 */
async function fetchFromGoogleBooks(isbn, title, author) {
  try {
    let query = '';
    if (isbn) {
      query = `isbn:${isbn}`;
    } else if (title && author) {
      query = `intitle:${encodeURIComponent(title)}+inauthor:${encodeURIComponent(author)}`;
    } else {
      return null;
    }

    const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
    const apiKeyParam = apiKey ? `&key=${apiKey}` : '';
    const url = `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1${apiKeyParam}`;

    const res = await retryFetch(url, {
      headers: {
        'User-Agent': 'BookStorePOS/1.0 (contact@bookstorepos.com)'
      }
    }, { label: 'Google Books' });
    
    if (!res || !res.ok) return null;
    const data = await res.json();
    if (!data.items || data.items.length === 0) return null;

    const info = data.items[0].volumeInfo;
    const coverUrl = info.imageLinks?.large || info.imageLinks?.medium || info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail;

    if (!coverUrl) return null;

    return {
      title: info.title,
      author: info.authors ? info.authors.join(', ') : author,
      publisher: info.publisher || null,
      published_year: parsePublishedYear(info.publishedDate),
      description: info.description || null,
      edition: info.contentVersion || null,
      front_cover_url: coverUrl.replace('http://', 'https://'),
      cover_source: 'Google Books',
      page_count: info.pageCount || 0
    };
  } catch (err) {
    console.error('Google Books API error:', err.message);
    return null;
  }
}

/**
 * Searches Open Library API.
 */
async function fetchFromOpenLibrary(isbn, title, author) {
  const headers = { 'User-Agent': 'BookStorePOS/1.0 (contact@bookstorepos.com)' };
  
  try {
    if (isbn) {
      // Fetch metadata by ISBN
      const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
      const res = await retryFetch(url, { headers }, { label: 'Open Library (ISBN)' });
      if (res && res.ok) {
        const data = await res.json();
        const bookKey = `ISBN:${isbn}`;
        const info = data[bookKey];

        if (info) {
          const coverUrl = info.cover?.large || info.cover?.medium || info.cover?.small;
          if (coverUrl) {
            return {
              title: info.title,
              author: info.authors ? info.authors.map(a => a.name).join(', ') : author,
              publisher: info.publishers ? info.publishers.map(p => p.name).join(', ') : null,
              published_year: parsePublishedYear(info.publish_date),
              description: info.notes || null,
              edition: info.edition_name || null,
              front_cover_url: coverUrl.replace('http://', 'https://'),
              cover_source: 'Open Library',
              page_count: info.number_of_pages || 0
            };
          }
        }
      }

      // Check standard cover URL by ISBN if metadata was missing or had no cover
      const directCoverUrl = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
      const headRes = await retryFetch(directCoverUrl, { method: 'HEAD', headers }, { label: 'Open Library (Cover)', maxRetries: 2, timeout: 8000 });
      if (headRes && headRes.ok) {
        return {
          front_cover_url: directCoverUrl,
          cover_source: 'Open Library'
        };
      }
    } else if (title && author) {
      // Fetch search data by title and author
      const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}&limit=1`;
      const res = await retryFetch(url, { headers }, { label: 'Open Library (Search)' });
      if (!res || !res.ok) return null;
      const data = await res.json();
      if (!data.docs || data.docs.length === 0) return null;

      const doc = data.docs[0];
      if (doc.cover_i) {
        return {
          title: doc.title,
          author: doc.author_name ? doc.author_name.join(', ') : author,
          publisher: doc.publisher ? doc.publisher[0] : null,
          published_year: doc.first_publish_year || parsePublishedYear(doc.publish_date ? doc.publish_date[0] : null),
          edition: doc.edition_count ? `${doc.edition_count} editions` : null,
          front_cover_url: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
          cover_source: 'Open Library',
          page_count: doc.number_of_pages_median || doc.number_of_pages || 0
        };
      }
    }
    return null;
  } catch (err) {
    console.error('Open Library API error:', err.message);
    return null;
  }
}

/**
 * Searches ISBNdb API (premium/requires API key).
 */
async function fetchFromISBNdb(isbn) {
  const apiKey = process.env.ISBNDB_API_KEY;
  if (!apiKey || !isbn) return null;

  try {
    const res = await retryFetch(`https://api2.isbndb.com/book/${isbn}`, {
      headers: {
        'Authorization': apiKey,
        'User-Agent': 'BookStorePOS/1.0 (contact@bookstorepos.com)'
      }
    }, { label: 'ISBNdb' });
    if (!res || !res.ok) return null;
    const data = await res.json();
    if (!data.book) return null;

    const book = data.book;
    return {
      title: book.title,
      author: book.authors ? book.authors.join(', ') : '',
      publisher: book.publisher || null,
      published_year: parsePublishedYear(book.publish_date),
      description: book.synopsis || null,
      edition: book.edition || null,
      front_cover_url: book.image || null,
      cover_source: 'ISBNdb',
      page_count: book.pages || book.page_count || 0
    };
  } catch (err) {
    console.error('ISBNdb API error:', err.message);
    return null;
  }
}

/**
 * Searches Amazon Product Advertising API (stub).
 */
async function fetchFromAmazon(isbn) {
  const awsAccessKey = process.env.AMAZON_AWS_ACCESS_KEY;
  const awsSecretKey = process.env.AMAZON_AWS_SECRET_KEY;
  if (!awsAccessKey || !awsSecretKey || !isbn) return null;

  try {
    // A production-ready app would sign a request using AWS signature V4 and call the Product Advertising API.
    // For this example, we log and return null as a stub indicating how a secure API integration would behave.
    console.log(`[Amazon PA-API] Simulating lookup for ISBN ${isbn}...`);
    return null;
  } catch (err) {
    console.error('Amazon API error:', err.message);
    return null;
  }
}

/**
 * Custom publisher cover image resolver.
 * Predicts and checks publisher cover URLs based on publisher name and ISBN.
 */
async function fetchFromPublisher(isbn, publisher) {
  if (!isbn) return null;
  const cleanIsbn = isbn.replace(/[- ]/g, '');
  const lowerPublisher = publisher ? publisher.toLowerCase() : '';
  const headers = { 'User-Agent': 'BookStorePOS/1.0 (contact@bookstorepos.com)' };

  try {
    // 1. O'Reilly Media covers
    if (lowerPublisher.includes('oreilly') || lowerPublisher.includes("o'reilly") || lowerPublisher.includes('o’reilly')) {
      const url = `https://learning.oreilly.com/library/cover/${cleanIsbn}/`;
      const headRes = await retryFetch(url, { method: 'HEAD', headers }, { label: "Publisher (O'Reilly)", maxRetries: 2, timeout: 8000 });
      if (headRes && headRes.ok) {
        return {
          front_cover_url: url,
          publisher: 'O\'Reilly Media',
          cover_source: 'Publisher (O\'Reilly)'
        };
      }
    }

    // 2. Springer covers
    if (lowerPublisher.includes('springer')) {
      const url = `https://covers.springer.com/books/isbn/jpg/${cleanIsbn}.jpg`;
      const headRes = await retryFetch(url, { method: 'HEAD', headers }, { label: 'Publisher (Springer)', maxRetries: 2, timeout: 8000 });
      if (headRes && headRes.ok) {
        return {
          front_cover_url: url,
          publisher: 'Springer',
          cover_source: 'Publisher (Springer)'
        };
      }
    }

    // 3. Open Road Media / other publishers (additional templates can go here)

    return null;
  } catch (err) {
    console.error('Publisher cover resolver error:', err.message);
    return null;
  }
}

/**
 * Main function to fetch book metadata from external sources with caching and fallback.
 */
async function fetchBookMetadata(isbn, title, author, publisher = '') {
  // Clean inputs
  const cleanIsbn = isbn ? isbn.trim().replace(/[- ]/g, '') : '';
  const cleanTitle = title ? title.trim() : '';
  const cleanAuthor = author ? author.trim() : '';
  const cleanPublisher = publisher ? publisher.trim() : '';

  // Check cache
  const cacheKey = cleanIsbn || `${cleanTitle.toLowerCase()}:${cleanAuthor.toLowerCase()}`;
  if (cacheKey && cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  console.log(`Resolving metadata for ISBN: "${cleanIsbn}", Title: "${cleanTitle}", Author: "${cleanAuthor}", Publisher: "${cleanPublisher}"`);

  let result = null;

  // 1. Try ISBN-based lookups first if ISBN is available
  if (cleanIsbn) {
    // 1a. Google Books API by ISBN
    result = await fetchFromGoogleBooks(cleanIsbn, null, null);
    
    // 1b. Open Library API by ISBN
    if (!result || !result.front_cover_url) {
      const olResult = await fetchFromOpenLibrary(cleanIsbn, null, null);
      if (olResult && olResult.front_cover_url) {
        result = { ...result, ...olResult };
      }
    }

    // 1c. ISBNdb API by ISBN (if key configured)
    if ((!result || !result.front_cover_url) && process.env.ISBNDB_API_KEY) {
      const isbndbResult = await fetchFromISBNdb(cleanIsbn);
      if (isbndbResult && isbndbResult.front_cover_url) {
        result = { ...result, ...isbndbResult };
      }
    }

    // 1d. Amazon API by ISBN (if key configured)
    if ((!result || !result.front_cover_url) && process.env.AMAZON_AWS_ACCESS_KEY) {
      const amazonResult = await fetchFromAmazon(cleanIsbn);
      if (amazonResult && amazonResult.front_cover_url) {
        result = { ...result, ...amazonResult };
      }
    }

    // 1e. Publisher source by ISBN
    if (!result || !result.front_cover_url) {
      const pubName = result?.publisher || cleanPublisher;
      const publisherResult = await fetchFromPublisher(cleanIsbn, pubName);
      if (publisherResult && publisherResult.front_cover_url) {
        result = { ...result, ...publisherResult };
      }
    }
  }

  // 2. If ISBN lookups yielded no cover (or no ISBN was provided), try Title + Author matching
  const hasNoCover = !result || !result.front_cover_url || result.cover_source === 'None' || result.front_cover_url.includes('cover-not-available.svg');
  if (hasNoCover && cleanTitle && cleanAuthor) {
    console.log(`ISBN lookup did not resolve an official cover for "${cleanTitle}". Attempting Title + Author lookup...`);
    
    // 2a. Google Books API by Title + Author
    const gbResult = await fetchFromGoogleBooks(null, cleanTitle, cleanAuthor);
    if (gbResult && gbResult.front_cover_url) {
      result = { ...result, ...gbResult };
    }

    // 2b. Open Library API by Title + Author
    if (!result || !result.front_cover_url || result.cover_source === 'None' || result.front_cover_url.includes('cover-not-available.svg')) {
      const olResult = await fetchFromOpenLibrary(null, cleanTitle, cleanAuthor);
      if (olResult && olResult.front_cover_url) {
        result = { ...result, ...olResult };
      }
    }
  }

  // Process final results and apply ultimate fallback (never use placeholder/AI covers)
  if (result && result.front_cover_url && !result.front_cover_url.includes('cover-not-available.svg')) {
    // Fill in default fields if missing
    result.title = result.title || cleanTitle;
    result.author = result.author || cleanAuthor;
    result.isbn = result.isbn || cleanIsbn || null;
    result.publisher = result.publisher || cleanPublisher || null;
    result.cover_source = result.cover_source || 'None';
    result.page_count = result.page_count || 0;
  } else {
    // Ultimate fallback if no official covers are available: "Cover Not Available"
    result = {
      title: cleanTitle,
      author: cleanAuthor,
      isbn: cleanIsbn || null,
      publisher: cleanPublisher || null,
      published_year: result?.published_year || null,
      description: result?.description || null,
      edition: result?.edition || null,
      front_cover_url: '/uploads/cover-not-available.svg',
      cover_source: 'None',
      page_count: result?.page_count || 0
    };
  }

  // Save to cache
  if (cacheKey) {
    cache.set(cacheKey, result);
  }

  return result;
}

module.exports = {
  fetchBookMetadata
};

