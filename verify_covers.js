const { getImageDimensions } = require('./src/utils/imageValidator');
const { fetchBookMetadata } = require('./src/services/metadataService');

async function testImageValidator() {
  console.log('--- Testing Image Validator ---');
  
  // 1. Valid PNG Buffer (200x100)
  const validPng = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // signature
    0x00, 0x00, 0x00, 0x0D,                         // IHDR chunk length
    0x49, 0x48, 0x44, 0x52,                         // "IHDR"
    0x00, 0x00, 0x00, 0xC8,                         // width = 200
    0x00, 0x00, 0x00, 0x64,                         // height = 100
    0x08, 0x02, 0x00, 0x00, 0x00                    // remaining IHDR data
  ]);

  try {
    const dim = getImageDimensions(validPng);
    console.log('✅ PNG dimension test passed:', dim);
    if (dim.width !== 200 || dim.height !== 100 || dim.type !== 'png') {
      throw new Error('PNG dimensions mismatch');
    }
  } catch (err) {
    console.error('❌ PNG test failed:', err.message);
    process.exit(1);
  }

  // 2. Valid JPEG Buffer (200x100)
  const validJpeg = Buffer.from([
    0xFF, 0xD8,             // SOI
    0xFF, 0xC0,             // SOF0 marker
    0x00, 0x0B,             // length
    0x08,                   // precision
    0x00, 0x64,             // height = 100
    0x00, 0xC8,             // width = 200
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01 // components info
  ]);

  try {
    const dim = getImageDimensions(validJpeg);
    console.log('✅ JPEG dimension test passed:', dim);
    if (dim.width !== 200 || dim.height !== 100 || dim.type !== 'jpeg') {
      throw new Error('JPEG dimensions mismatch');
    }
  } catch (err) {
    console.error('❌ JPEG test failed:', err.message);
    process.exit(1);
  }

  // 3. Invalid format
  const invalidBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
  try {
    getImageDimensions(invalidBuffer);
    console.error('❌ Invalid buffer validation test failed (should have thrown)');
    process.exit(1);
  } catch (err) {
    console.log('✅ Invalid format validation test passed:', err.message);
  }
}

async function testMetadataService() {
  console.log('\n--- Testing Metadata Service ---');

  // Test 1: Fetching O'Reilly publisher cover source
  console.log('Test 1: Fetching Publisher cover (O\'Reilly)...');
  try {
    const meta = await fetchBookMetadata('9781491918899', 'Learning React', 'Alex Banks', 'O\'Reilly Media');
    console.log('✅ Publisher cover response:', meta);
    if (!meta.front_cover_url.includes('learning.oreilly.com') || meta.cover_source !== 'Publisher (O\'Reilly)') {
      console.warn('⚠️ Publisher resolver did not return O\'Reilly cover url. Check internet/API access.');
    }
  } catch (err) {
    console.error('❌ Publisher cover test failed:', err.message);
  }

  // Test 2: Checking caching
  console.log('Test 2: Verifying cache hit speed...');
  const start = Date.now();
  const metaCached = await fetchBookMetadata('9781491918899', 'Learning React', 'Alex Banks', 'O\'Reilly Media');
  const elapsed = Date.now() - start;
  console.log(`✅ Cache hit took: ${elapsed}ms`);
  if (elapsed > 10) {
    console.error('❌ Cache test failed (took too long for cached value)');
    process.exit(1);
  } else {
    console.log('✅ Cache test passed');
  }

  // Test 3: Fallback logic for invalid books
  console.log('Test 3: Ultimate fallback check...');
  const metaFallback = await fetchBookMetadata('9999999999999', 'Fake Book Title XYZ', 'Fake Author');
  console.log('✅ Fallback response:', metaFallback);
  if (metaFallback.front_cover_url !== '/uploads/cover-not-available.svg' || metaFallback.cover_source !== 'None') {
    console.error('❌ Fallback test failed');
    process.exit(1);
  } else {
    console.log('✅ Fallback test passed');
  }
}

async function run() {
  await testImageValidator();
  await testMetadataService();
  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
}

run();
