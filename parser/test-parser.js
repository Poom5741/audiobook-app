const axios = require('axios');
const path = require('path');
const fs = require('fs');

const API_BASE = 'http://localhost:3002/api';

async function testParser() {
  console.log('📚 Testing Parser Service...\n');

  try {
    // 1. Health check
    console.log('1️⃣ Health check...');
    const healthResponse = await axios.get('http://localhost:3002/health');
    console.log('✅ Parser service is running:', healthResponse.data);

    // 2. Get stats
    console.log('\n2️⃣ Getting parsing statistics...');
    const statsResponse = await axios.get(`${API_BASE}/stats`);
    console.log('📊 Stats:', statsResponse.data);

    // 3. List books
    console.log('\n3️⃣ Listing parsed books...');
    const booksResponse = await axios.get(`${API_BASE}/books`);
    console.log(`📖 Found ${booksResponse.data.length} parsed books`);
    
    if (booksResponse.data.length > 0) {
      console.log('Books:');
      booksResponse.data.forEach(book => {
        console.log(`  - ${book.title} by ${book.author} (${book.totalChapters} chapters)`);
      });

      // 4. Get chapters for first book
      const firstBook = booksResponse.data[0];
      console.log(`\n4️⃣ Getting chapters for: ${firstBook.title}`);
      
      const chaptersResponse = await axios.get(`${API_BASE}/books/${firstBook.slug}/chapters`);
      console.log(`📑 Found ${chaptersResponse.data.length} chapters`);
      
      chaptersResponse.data.slice(0, 3).forEach((chapter, i) => {
        console.log(`  Chapter ${i + 1}: ${chapter.title} (${chapter.wordCount} words)`);
      });
    }

    // 5. Test file parsing (if sample file exists)
    const samplePDF = '../books/sample.pdf';
    if (fs.existsSync(samplePDF)) {
      console.log('\n5️⃣ Testing file parsing...');
      
      const parseResponse = await axios.post(`${API_BASE}/parse/file`, {
        filePath: path.resolve(samplePDF),
        options: {
          chunkSize: 1000,
          splitBy: 'both',
          saveToDb: true
        }
      });
      
      console.log('✅ Parsing result:', {
        bookSlug: parseResponse.data.bookSlug,
        chapters: parseResponse.data.chaptersCount,
        outputDir: parseResponse.data.outputDir
      });
    }

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// CLI test for direct parsing
async function testCLI() {
  console.log('\n🖥️  CLI Testing Instructions:\n');
  
  console.log('1. Parse a PDF file:');
  console.log('   node src/index.js /path/to/book.pdf');
  console.log('   node src/index.js /path/to/book.pdf --chunk-size 2000 --split-by chapters');
  
  console.log('\n2. Parse an EPUB file:');
  console.log('   node src/index.js /path/to/book.epub --save-db --verbose');
  
  console.log('\n3. Options:');
  console.log('   --output <dir>        Output directory (default: ./parser/output)');
  console.log('   --chunk-size <words>  Words per chunk (default: 1500)');
  console.log('   --split-by <method>   Split method: chapters|chunks|both (default: both)');
  console.log('   --save-db            Save to database');
  console.log('   --verbose            Verbose logging');
}

// Check if service is running
axios.get('http://localhost:3002/health')
  .then(() => {
    testParser().then(() => {
      testCLI();
    });
  })
  .catch(() => {
    console.log('❌ Parser service is not running!');
    console.log('\nStart the service with:');
    console.log('cd parser && npm install && npm start');
    console.log('\nOr use Docker:');
    console.log('docker-compose up parser');
    
    testCLI();
  });