require('dotenv').config();
const { classifyBookWithGemini } = require('./src/services/geminiService');

async function runTest() {
  console.log('Testing Gemini Fallback Logic...');
  
  const book = {
    title: 'Test Book For Gemini Resilience',
    author: 'Tester Auth',
    description: 'This is a book about building resilient systems.',
    publisher: 'Test Pub'
  };

  try {
    const promises = Array.from({ length: 6 }).map((_, i) => {
      console.log(`Dispatching request ${i + 1}...`);
      return classifyBookWithGemini(book).then(res => {
        console.log(`Request ${i + 1} succeeded:`, res.primaryCategoryName);
      }).catch(err => {
        console.error(`Request ${i + 1} failed:`, err.message);
      });
    });

    await Promise.all(promises);
    console.log('All requests completed.');
  } catch (err) {
    console.error('Test script failed:', err);
  }
}

runTest();
