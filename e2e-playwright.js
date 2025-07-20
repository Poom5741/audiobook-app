const { chromium } = require('playwright');

/**
 * 🎭 Playwright E2E Test Suite for AudioBook Central
 * Tests the complete user experience from library to audio playback
 */

// Test configuration
const BASE_URL = 'http://localhost:3000';
const API_BASE_URL = 'http://localhost:5001';
const BOOK_ID = 'ee369d94-0318-4092-9d55-eb601c953784';
const CHAPTER_ID = '01d3126e-c105-4d0a-be15-4dc1edeaa18d';

// ANSI colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

// Test results
let passed = 0;
let failed = 0;
let results = [];

// Helper functions
function log(message, color = RESET) {
  console.log(`${color}${message}${RESET}`);
}

function logTest(name, success, details = '') {
  const status = success ? `${GREEN}✅ PASSED${RESET}` : `${RED}❌ FAILED${RESET}`;
  log(`Testing ${name}... ${status}`);
  if (!success && details) {
    log(`  ${details}`, RED);
  }
  results.push({ name, success, details });
  if (success) passed++;
  else failed++;
}

async function runTests() {
  log(`${BOLD}${YELLOW}🎭 PLAYWRIGHT E2E TEST SUITE${RESET}`);
  log('===============================');
  
  // Launch browser using system Chrome
  const browser = await chromium.launch({ 
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Test 1: Frontend loads and shows title
    log(`\n${YELLOW}📱 FRONTEND BASIC TESTS${RESET}`);
    log('======================');
    
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    
    const title = await page.title();
    logTest('Frontend Page Title', title.includes('AudioBook Central'));
    
    // Test 2: Check if page shows library content
    const libraryHeading = await page.locator('h1:has-text("Your Audiobook Library")').first();
    const hasLibraryHeading = await libraryHeading.isVisible();
    logTest('Library Heading Visible', hasLibraryHeading);
    
    // Test 3: Check if book is displayed
    const bookTitle = await page.locator('text=Trading in the Zone').first();
    const hasBookTitle = await bookTitle.isVisible();
    logTest('Book Title Displayed', hasBookTitle);
    
    // Test 4: Check if author is displayed
    const authorName = await page.locator('text=Mark Douglas').first();
    const hasAuthorName = await authorName.isVisible();
    logTest('Author Name Displayed', hasAuthorName);
    
    // Test 5: Check if book link is correct (not undefined)
    const bookLink = await page.locator(`a[href="/book/${BOOK_ID}"]`).first();
    const hasCorrectLink = await bookLink.isVisible();
    logTest('Book Link Not Undefined', hasCorrectLink);
    
    // Test 6: Navigate to book page
    log(`\n${YELLOW}📖 BOOK PAGE NAVIGATION${RESET}`);
    log('========================');
    
    await bookLink.click();
    await page.waitForLoadState('networkidle');
    
    // Check if we're on the book page
    const currentUrl = page.url();
    const isOnBookPage = currentUrl.includes(`/book/${BOOK_ID}`);
    logTest('Book Page Navigation', isOnBookPage);
    
    // Test 7: Book page shows book details
    const bookPageTitle = await page.locator('h1:has-text("Trading in the Zone")').first();
    const hasBookPageTitle = await bookPageTitle.isVisible();
    logTest('Book Page Title Visible', hasBookPageTitle);
    
    // Test 8: Book page shows author
    const bookPageAuthor = await page.locator('text=by Mark Douglas').first();
    const hasBookPageAuthor = await bookPageAuthor.isVisible();
    logTest('Book Page Author Visible', hasBookPageAuthor);
    
    // Test 9: Book page shows chapters
    const chaptersHeading = await page.locator('h2:has-text("Chapters")').first();
    const hasChaptersHeading = await chaptersHeading.isVisible();
    logTest('Chapters Section Visible', hasChaptersHeading);
    
    // Test 10: Check if chapters are listed
    const chapterItems = await page.locator('.chapter-item').count();
    logTest('Chapters Listed', chapterItems > 0, `Found ${chapterItems} chapters`);
    
    // Test 11: Check if audio-ready chapters have play buttons
    log(`\n${YELLOW}🎵 AUDIO FUNCTIONALITY${RESET}`);
    log('=======================');
    
    const playButtons = await page.locator('button:has-text("Play")').count();
    logTest('Play Buttons Available', playButtons > 0, `Found ${playButtons} play buttons`);
    
    // Test 12: Click on a play button and check audio player appears
    if (playButtons > 0) {
      const firstPlayButton = await page.locator('button:has-text("Play")').first();
      await firstPlayButton.click();
      await page.waitForTimeout(1000); // Wait for audio player to load
      
      // Check if audio player is visible
      const audioPlayer = await page.locator('audio').first();
      const hasAudioPlayer = await audioPlayer.isVisible();
      logTest('Audio Player Appears', hasAudioPlayer);
      
      // Test 13: Check if audio player has valid source
      if (hasAudioPlayer) {
        const audioSrc = await audioPlayer.getAttribute('src');
        const hasValidSrc = audioSrc && audioSrc.includes('/api/audio/');
        logTest('Audio Player Has Valid Source', hasValidSrc, `Source: ${audioSrc}`);
      }
    }
    
    // Test 14: Check if back to library link works
    log(`\n${YELLOW}🔙 NAVIGATION TESTS${RESET}`);
    log('===================');
    
    const backButton = await page.locator('a:has-text("Back to Library")').first();
    const hasBackButton = await backButton.isVisible();
    logTest('Back Button Visible', hasBackButton);
    
    if (hasBackButton) {
      await backButton.click();
      await page.waitForLoadState('networkidle');
      
      const backToLibrary = page.url() === BASE_URL + '/';
      logTest('Back to Library Navigation', backToLibrary);
    }
    
    // Test 15: Check if API calls are working
    log(`\n${YELLOW}🔗 API INTEGRATION${RESET}`);
    log('==================');
    
    // Listen for API calls
    const apiCalls = [];
    page.on('response', response => {
      if (response.url().includes('/api/')) {
        apiCalls.push({
          url: response.url(),
          status: response.status()
        });
      }
    });
    
    // Refresh page to trigger API calls
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Check if books API was called successfully
    const booksApiCall = apiCalls.find(call => call.url.includes('/api/books') && !call.url.includes('/chapters'));
    logTest('Books API Called', booksApiCall && booksApiCall.status === 200);
    
    // Test 16: Check console errors
    log(`\n${YELLOW}🐛 ERROR CHECKING${RESET}`);
    log('==================');
    
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    logTest('No Console Errors', consoleErrors.length === 0, `Found ${consoleErrors.length} errors`);
    
    if (consoleErrors.length > 0) {
      consoleErrors.forEach(error => log(`  Error: ${error}`, RED));
    }
    
  } catch (error) {
    log(`\n${RED}Test execution failed: ${error.message}${RESET}`);
    failed++;
  } finally {
    await browser.close();
  }
  
  // Test summary
  log(`\n${YELLOW}📊 TEST SUMMARY${RESET}`);
  log('===============');
  
  const total = passed + failed;
  const passRate = Math.round((passed / total) * 100);
  
  log(`Total Tests: ${total}`);
  log(`Passed: ${GREEN}${passed}${RESET}`);
  log(`Failed: ${RED}${failed}${RESET}`);
  log(`Pass Rate: ${GREEN}${passRate}%${RESET}`);
  
  if (failed === 0) {
    log(`\n🎉 ${GREEN}ALL TESTS PASSED! Frontend is fully functional.${RESET}`);
    log(`✅ Ready to use: ${BASE_URL}`);
    log(`✅ Book page: ${BASE_URL}/book/${BOOK_ID}`);
    process.exit(0);
  } else {
    log(`\n⚠️  ${RED}Some tests failed. Check the issues above.${RESET}`);
    process.exit(1);
  }
}

// Run tests
runTests().catch(console.error);