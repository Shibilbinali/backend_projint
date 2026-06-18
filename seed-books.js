const fs = require('fs');
const path = require('path');
const pool = require('./src/config/db');
const { fetchBookMetadata } = require('./src/services/metadataService');

const BOOKS = [
  // 1-10 Fiction
  { title: "Harry Potter and the Sorcerer's Stone", author: "J.K. Rowling", isbn: "9780439708180", category_id: 1, price: 599.00, cost_price: 250.00, stock_qty: 45, low_stock_threshold: 10, publisher: "Scholastic", published_year: 1997, description: "A young boy discovers he is a wizard and goes to Hogwarts School of Witchcraft and Wizardry." },
  { title: "Harry Potter and the Chamber of Secrets", author: "J.K. Rowling", isbn: "9780439064873", category_id: 1, price: 599.00, cost_price: 250.00, stock_qty: 38, low_stock_threshold: 10, publisher: "Scholastic", published_year: 1998, description: "Harry's second year at Hogwarts is marked by mysterious attacks on students and a hidden chamber." },
  { title: "Harry Potter and the Prisoner of Azkaban", author: "J.K. Rowling", isbn: "9780439136358", category_id: 1, price: 699.00, cost_price: 300.00, stock_qty: 42, low_stock_threshold: 10, publisher: "Scholastic", published_year: 1999, description: "Harry learns that a dangerous mass murderer has escaped from Azkaban prison and is coming for him." },
  { title: "The Hobbit", author: "J.R.R. Tolkien", isbn: "9780547928227", category_id: 1, price: 499.00, cost_price: 200.00, stock_qty: 32, low_stock_threshold: 8, publisher: "Houghton Mifflin", published_year: 1937, description: "A homebody hobbit Bilbo Baggins goes on a grand adventure with dwarves and a wizard to win a share of treasure." },
  { title: "The Lord of the Rings: Fellowship of the Ring", author: "J.R.R. Tolkien", isbn: "9780618346257", category_id: 1, price: 799.00, cost_price: 350.00, stock_qty: 28, low_stock_threshold: 8, publisher: "Houghton Mifflin", published_year: 1954, description: "The dark lord Sauron seeks the One Ring. A young hobbit Frodo is tasked with destroying it in Mount Doom." },
  { title: "To Kill a Mockingbird", author: "Harper Lee", isbn: "9780061935466", category_id: 1, price: 399.00, cost_price: 150.00, stock_qty: 30, low_stock_threshold: 8, publisher: "HarperCollins", published_year: 1960, description: "A story of racial injustice and the destruction of innocence in the deep American South." },
  { title: "1984", author: "George Orwell", isbn: "9780451524935", category_id: 1, price: 299.00, cost_price: 100.00, stock_qty: 60, low_stock_threshold: 15, publisher: "Signet Classic", published_year: 1949, description: "A dystopian novel set in a totalitarian regime where Big Brother is constantly watching everyone." },
  { title: "Animal Farm", author: "George Orwell", isbn: "9780451526342", category_id: 1, price: 249.00, cost_price: 80.00, stock_qty: 50, low_stock_threshold: 12, publisher: "Signet Classic", published_year: 1945, description: "A group of farm animals rebel against their human farmer, hoping to create a society where animals can be equal." },
  { title: "Pride and Prejudice", author: "Jane Austen", isbn: "9780141439518", category_id: 1, price: 199.00, cost_price: 70.00, stock_qty: 25, low_stock_threshold: 5, publisher: "T. Egerton", published_year: 1813, description: "A romantic clash between Elizabeth Bennet and the proud, wealthy Mr. Darcy." },
  { title: "The Great Gatsby", author: "F. Scott Fitzgerald", isbn: "9780743273565", category_id: 1, price: 349.00, cost_price: 130.00, stock_qty: 35, low_stock_threshold: 10, publisher: "Scribner", published_year: 1925, description: "A portrait of the Jazz Age, wealth, love, and the elusive American Dream in Long Island." },

  // 11-20 Self-Help / Finance / Business
  { title: "The Catcher in the Rye", author: "J.D. Salinger", isbn: "9780316769174", category_id: 1, price: 449.00, cost_price: 180.00, stock_qty: 22, low_stock_threshold: 6, publisher: "Little, Brown", published_year: 1951, description: "The story of teenage Holden Caulfield as he wanders New York City after being expelled from his prep school." },
  { title: "The Alchemist", author: "Paulo Coelho", isbn: "9780062315007", category_id: 1, price: 320.00, cost_price: 120.00, stock_qty: 48, low_stock_threshold: 10, publisher: "HarperOne", published_year: 1988, description: "An Andalusian shepherd boy travels in search of a worldly treasure, discovering a deeper spiritual destiny." },
  { title: "Rich Dad Poor Dad", author: "Robert T. Kiyosaki", isbn: "9781612680194", category_id: 7, price: 499.00, cost_price: 200.00, stock_qty: 55, low_stock_threshold: 12, publisher: "Warner Books", published_year: 1997, description: "Explodes the myth that you need to earn a high income to become rich and teaches financial independence." },
  { title: "Atomic Habits", author: "James Clear", isbn: "9780735211292", category_id: 7, price: 650.00, cost_price: 280.00, stock_qty: 75, low_stock_threshold: 15, publisher: "Avery", published_year: 2018, description: "A revolutionary guide to breaking bad habits and building good ones in tiny, manageable steps." },
  { title: "Think and Grow Rich", author: "Napoleon Hill", isbn: "9781585424337", category_id: 7, price: 299.00, cost_price: 100.00, stock_qty: 40, low_stock_threshold: 8, publisher: "Tarcher/Perigee", published_year: 1937, description: "Drawing on interviews with the wealthiest individuals of his era, Hill outlines 13 principles for achievement." },
  { title: "The Psychology of Money", author: "Morgan Housel", isbn: "9789390166268", category_id: 7, price: 399.00, cost_price: 160.00, stock_qty: 50, low_stock_threshold: 10, publisher: "Harriman House", published_year: 2020, description: "An exploration of how people make financial decisions and how behavior and psychology dictate wealth." },
  { title: "The Lean Startup", author: "Eric Ries", isbn: "9780307887894", category_id: 7, price: 599.00, cost_price: 250.00, stock_qty: 30, low_stock_threshold: 8, publisher: "Crown Business", published_year: 2011, description: "How modern entrepreneurs use continuous innovation to create radically successful businesses." },
  { title: "Sapiens", author: "Yuval Noah Harari", isbn: "9780062316097", category_id: 8, price: 699.00, cost_price: 300.00, stock_qty: 28, low_stock_threshold: 8, publisher: "Harper", published_year: 2011, description: "A sweeping overview of the evolutionary history of humankind, from the Stone Age to the modern era." },
  { title: "The Power of Habit", author: "Charles Duhigg", isbn: "9780812981605", category_id: 7, price: 499.00, cost_price: 200.00, stock_qty: 24, low_stock_threshold: 6, publisher: "Random House", published_year: 2012, description: "An investigation into the neuroscience of habit loop formation and how habits can be altered." },
  { title: "The 7 Habits of Highly Effective People", author: "Stephen R. Covey", isbn: "9781451639612", category_id: 7, price: 450.00, cost_price: 180.00, stock_qty: 34, low_stock_threshold: 8, publisher: "Free Press", published_year: 1989, description: "Presents a holistic, integrated, principle-centered approach for solving personal and professional problems." },

  // 21-30 Classics & History
  { title: "The Kite Runner", author: "Khaled Hosseini", isbn: "9781594631931", category_id: 1, price: 499.00, cost_price: 200.00, stock_qty: 18, low_stock_threshold: 5, publisher: "Riverhead Books", published_year: 2003, description: "An epic story of friendship, betrayal, and redemption set against the turbulent history of Afghanistan." },
  { title: "Frankenstein", author: "Mary Shelley", isbn: "9780141439471", category_id: 1, price: 199.00, cost_price: 70.00, stock_qty: 15, low_stock_threshold: 4, publisher: "Lackington, Hughes", published_year: 1818, description: "A young scientist creates a sentient creature in an unorthodox scientific experiment, with tragic results." },
  { title: "Dracula", author: "Bram Stoker", isbn: "9780141439846", category_id: 1, price: 249.00, cost_price: 90.00, stock_qty: 12, low_stock_threshold: 4, publisher: "Archibald Constable", published_year: 1897, description: "The classic vampire story of Count Dracula's attempt to move from Transylvania to England to find new blood." },
  { title: "The Picture of Dorian Gray", author: "Oscar Wilde", isbn: "9780141439570", category_id: 1, price: 220.00, cost_price: 85.00, stock_qty: 20, low_stock_threshold: 5, publisher: "Ward, Lock & Co.", published_year: 1890, description: "A young man sells his soul so that his portrait will age and bear the marks of his sins instead of his body." },
  { title: "Moby-Dick", author: "Herman Melville", isbn: "9780142437247", category_id: 1, price: 399.00, cost_price: 150.00, stock_qty: 14, low_stock_threshold: 3, publisher: "Harper & Brothers", published_year: 1851, description: "The obsessive quest of Captain Ahab for revenge on Moby Dick, the giant white whale that bit off his leg." },
  { title: "Crime and Punishment", author: "Fyodor Dostoevsky", isbn: "9780140449136", category_id: 8, price: 450.00, cost_price: 180.00, stock_qty: 25, low_stock_threshold: 5, publisher: "The Russian Messenger", published_year: 1866, description: "The mental anguish and moral dilemmas of Rodion Raskolnikov, an impoverished ex-student who kills an unscrupulous pawnbroker." },
  { title: "Wuthering Heights", author: "Emily Brontë", isbn: "9780141439556", category_id: 1, price: 299.00, cost_price: 100.00, stock_qty: 16, low_stock_threshold: 5, publisher: "Thomas Cautley Newby", published_year: 1847, description: "The tragic, turbulent love story between Heathcliff and Catherine Earnshaw on the Yorkshire moors." },
  { title: "Jane Eyre", author: "Charlotte Brontë", isbn: "9780141441146", category_id: 1, price: 349.00, cost_price: 130.00, stock_qty: 18, low_stock_threshold: 5, publisher: "Smith, Elder & Co.", published_year: 1847, description: "The story of an orphaned young woman who goes to work as a governess at Thornfield Hall and falls in love with Mr. Rochester." },
  { title: "Little Women", author: "Louisa May Alcott", isbn: "9780147514011", category_id: 1, price: 249.00, cost_price: 90.00, stock_qty: 30, low_stock_threshold: 8, publisher: "Roberts Brothers", published_year: 1868, description: "The lives, loves, and tribulations of four sisters—Meg, Jo, Beth, and Amy—growing up in New England during the Civil War." },
  { title: "The Odyssey", author: "Homer", isbn: "9780140268867", category_id: 8, price: 399.00, cost_price: 150.00, stock_qty: 15, low_stock_threshold: 4, publisher: "Ancient Greece", published_year: -800, description: "The legendary journey of Odysseus, king of Ithaca, as he struggles to return home after the fall of Troy." },

  // 31-40 Science & Dystopia
  { title: "Brave New World", author: "Aldous Huxley", isbn: "9780060850524", category_id: 6, price: 399.00, cost_price: 150.00, stock_qty: 24, low_stock_threshold: 6, publisher: "Chatto & Windus", published_year: 1932, description: "A dystopian novel depicting a highly advanced future society structured around biological engineering and conditioning." },
  { title: "Fahrenheit 451", author: "Ray Bradbury", isbn: "9781451673319", category_id: 6, price: 349.00, cost_price: 130.00, stock_qty: 32, low_stock_threshold: 8, publisher: "Ballantine Books", published_year: 1953, description: "Set in a future society where books are banned and 'firemen' burn any that are found." },
  { title: "Lord of the Flies", author: "William Golding", isbn: "9780399501487", category_id: 1, price: 299.00, cost_price: 100.00, stock_qty: 28, low_stock_threshold: 6, publisher: "Faber and Faber", published_year: 1954, description: "A group of British schoolboys are stranded on an uninhabited island and their attempt to govern themselves turns disastrous." },
  { title: "One Hundred Years of Solitude", author: "Gabriel García Márquez", isbn: "9780060883287", category_id: 1, price: 499.00, cost_price: 200.00, stock_qty: 15, low_stock_threshold: 4, publisher: "Harper & Row", published_year: 1967, description: "The multi-generational story of the Buendía family, whose patriarch, José Arcadio Buendía, founded the town of Macondo." },
  { title: "Brave New World Revisited", author: "Aldous Huxley", isbn: "9780061448836", category_id: 6, price: 299.00, cost_price: 120.00, stock_qty: 8, low_stock_threshold: 3, publisher: "Harper & Brothers", published_year: 1958, description: "Huxley compares the modern world with his prophetic fantasy of Brave New World." },
  { title: "The Grapes of Wrath", author: "John Steinbeck", isbn: "9780143039433", category_id: 8, price: 420.00, cost_price: 160.00, stock_qty: 14, low_stock_threshold: 4, publisher: "The Viking Press", published_year: 1939, description: "Follows the Joads, a poor family of tenant farmers driven from their Oklahoma home during the Great Depression." },
  { title: "Ulysses", author: "James Joyce", isbn: "9780199535675", category_id: 1, price: 550.00, cost_price: 220.00, stock_qty: 6, low_stock_threshold: 2, publisher: "Sylvia Beach", published_year: 1922, description: "A monumental modernist novel detailing Leopold Bloom's passage through Dublin in the course of an ordinary day." },
  { title: "Catch-22", author: "Joseph Heller", isbn: "9781451626650", category_id: 1, price: 450.00, cost_price: 180.00, stock_qty: 12, low_stock_threshold: 4, publisher: "Simon & Schuster", published_year: 1961, description: "Set during World War II, a satirical historical novel about Captain John Yossarian, a US Army Air Forces B-25 bombardier." },
  { title: "Slaughterhouse-Five", author: "Kurt Vonnegut", isbn: "9780812988529", category_id: 1, price: 349.00, cost_price: 130.00, stock_qty: 20, low_stock_threshold: 5, publisher: "Delacorte Press", published_year: 1969, description: "A satirical science fiction novel about the Dresden bombings, following Billy Pilgrim, who has become unstuck in time." },
  { title: "The Chronicles of Narnia: The Lion, The Witch, and The Wardrobe", author: "C.S. Lewis", isbn: "9780064471046", category_id: 4, price: 299.00, cost_price: 110.00, stock_qty: 45, low_stock_threshold: 10, publisher: "Geoffrey Bles", published_year: 1950, description: "Four children travel through a wardrobe to the magical land of Narnia and assist Aslan in defeating the White Witch." },

  // 41-50 Tech, Finance & Modern Bestsellers
  { title: "The Road", author: "Cormac McCarthy", isbn: "9780307387899", category_id: 1, price: 399.00, cost_price: 150.00, stock_qty: 10, low_stock_threshold: 3, publisher: "Alfred A. Knopf", published_year: 2006, description: "A post-apocalyptic novel outlining the journey of a father and his young son over several months." },
  { title: "Thinking, Fast and Slow", author: "Daniel Kahneman", isbn: "9780374533557", category_id: 6, price: 599.00, cost_price: 250.00, stock_qty: 26, low_stock_threshold: 6, publisher: "Farrar, Straus and Giroux", published_year: 2011, description: "Outlines the dual system psychology model of cognitive processing and judgment bias." },
  { title: "Outliers: The Story of Success", author: "Malcolm Gladwell", isbn: "9780316017930", category_id: 2, price: 499.00, cost_price: 200.00, stock_qty: 35, low_stock_threshold: 8, publisher: "Little, Brown", published_year: 2008, description: "Examines the systemic and cultural factors that contribute to exceptionally high levels of success." },
  { title: "Zero to One", author: "Peter Thiel", isbn: "9780804139298", category_id: 6, price: 499.00, cost_price: 210.00, stock_qty: 40, low_stock_threshold: 8, publisher: "Crown Business", published_year: 2014, description: "Notes on startups, technology progress, and how to build the future by creating new monopolies." },
  { title: "Good to Great", author: "Jim Collins", isbn: "9780066620992", category_id: 7, price: 599.00, cost_price: 260.00, stock_qty: 15, low_stock_threshold: 4, publisher: "HarperBusiness", published_year: 2001, description: "Identifies why some businesses jump to greatness while others fail to break mediocrity." },
  { title: "Shoe Dog", author: "Phil Knight", isbn: "9781501135927", category_id: 2, price: 499.00, cost_price: 190.00, stock_qty: 48, low_stock_threshold: 10, publisher: "Scribner", published_year: 2016, description: "A memoir by the creator of Nike, detailing the startup's struggles and final transition into a global giant." },
  { title: "Educated", author: "Tara Westover", isbn: "9780399590504", category_id: 2, price: 450.00, cost_price: 180.00, stock_qty: 32, low_stock_threshold: 8, publisher: "Random House", published_year: 2018, description: "A memoir about a young girl who leaves her survivalist Idaho family to attend college, finalising in a PhD from Cambridge." },
  { title: "Quiet: The Power of Introverts", author: "Susan Cain", isbn: "9780307352156", category_id: 7, price: 499.00, cost_price: 200.00, stock_qty: 28, low_stock_threshold: 6, publisher: "Crown Publishing", published_year: 2012, description: "Explores how modern culture undervalues introverted personalities and outlines the strengths they possess." },
  { title: "Guns, Germs, and Steel", author: "Jared Diamond", isbn: "9780393317558", category_id: 8, price: 599.00, cost_price: 250.00, stock_qty: 18, low_stock_threshold: 5, publisher: "W.W. Norton", published_year: 1997, description: "Explores the geographical and environmental causes of global history inequalities." },
  { title: "The Divine Comedy", author: "Dante Alighieri", isbn: "9780141197494", category_id: 8, price: 399.00, cost_price: 150.00, stock_qty: 10, low_stock_threshold: 3, publisher: "Ancient Florence", published_year: 1320, description: "An epic poem detailing Dante's journey through Hell, Purgatory, and Paradise, guided by Virgil and Beatrice." }
];

async function seed() {
  try {
    console.log('=== BOOKSTORE POS SEEDER (OFFICIAL COVER METADATA) ===');

    // 1. Clear old transactions and sales history to prevent FK constraints
    console.log('Clearing old transaction data...');
    await pool.query('DELETE FROM sale_items');
    await pool.query('DELETE FROM sales');
    await pool.query('DELETE FROM books');
    console.log('Old records cleared.');

    // 2. Fetch cover images and Insert books
    console.log('Fetching official metadata & seeding 50 books (this may take a short while)...');
    for (let i = 0; i < BOOKS.length; i++) {
      const b = BOOKS[i];
      const bookId = i + 1;

      console.log(`[${bookId}/50] Fetching: "${b.title}" (ISBN: ${b.isbn})...`);
      
      let metadata;
      try {
        metadata = await fetchBookMetadata(b.isbn, b.title, b.author, b.publisher);
        console.log(`  -> Resolved from: ${metadata.cover_source} (${metadata.front_cover_url.substring(0, 60)}...)`);
      } catch (err) {
        console.error(`  -> Failed fetching for "${b.title}":`, err.message);
        metadata = {
          front_cover_url: '/uploads/cover-not-available.svg',
          cover_source: 'None',
          publisher: b.publisher,
          published_year: b.published_year,
          description: b.description,
          edition: null
        };
      }

      // Add a small 100ms pause to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));

      const title = metadata.title || b.title;
      const author = metadata.author || b.author;
      const publisher = metadata.publisher || b.publisher;
      const publishedYear = metadata.published_year || b.published_year;
      const description = metadata.description || b.description;
      const coverSource = metadata.cover_source;
      const edition = metadata.edition;
      const frontCoverUrl = metadata.front_cover_url;

      // Insert to DB
      await pool.query(
        `INSERT INTO books (
          id, title, author, isbn, category_id, price, cost_price, stock_qty,
          low_stock_threshold, cover_image_url, publisher, published_year, description,
          front_cover_url, back_cover_url, cover_source, edition
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          bookId, title, author, b.isbn, b.category_id, b.price, b.cost_price, b.stock_qty,
          b.low_stock_threshold, frontCoverUrl, publisher, publishedYear, description,
          frontCoverUrl, null, coverSource, edition
        ]
      );
    }

    // Reset sequence so serial works correctly later
    await pool.query("SELECT setval('books_id_seq', (SELECT MAX(id) FROM books))");
    console.log('✅ Seeding completed! 50 books loaded with official covers.');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await pool.end();
  }
}

seed();
