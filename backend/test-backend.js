const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

async function testBackend() {
  console.log('🔧 Testing Backend API...\n');

  try {
    // 1. Health check
    console.log('1️⃣ Health check...');
    const healthResponse = await axios.get('http://localhost:5000/health');
    console.log('✅ Backend service is running:', healthResponse.data);

    // 2. Get books
    console.log('\n2️⃣ Getting books list...');
    const booksResponse = await axios.get(`${API_BASE}/books`);
    console.log(`📚 Found ${booksResponse.data.books.length} books`);
    
    if (booksResponse.data.books.length > 0) {
      const firstBook = booksResponse.data.books[0];
      console.log(`First book: ${firstBook.title} by ${firstBook.author}`);
      
      // 3. Get book chapters
      console.log('\n3️⃣ Getting book chapters...');
      const chaptersResponse = await axios.get(`${API_BASE}/books/${firstBook.id}/chapters`);
      console.log(`📑 Found ${chaptersResponse.data.chapters.length} chapters`);
      
      if (chaptersResponse.data.chapters.length > 0) {
        const firstChapter = chaptersResponse.data.chapters[0];
        console.log(`First chapter: ${firstChapter.title}`);
        
        // 4. Test audio streaming (if available)
        if (firstChapter.hasAudio) {
          console.log('\n4️⃣ Testing audio info...');
          const audioInfoResponse = await axios.get(`${API_BASE}/audio/${firstBook.id}/${firstChapter.id}/info`);
          console.log('🎵 Audio info:', {
            title: audioInfoResponse.data.chapter.title,
            duration: audioInfoResponse.data.chapter.duration,
            hasAudio: audioInfoResponse.data.chapter.hasAudio,
            streamUrl: audioInfoResponse.data.streamUrl
          });
        }
      }
    }

    // 5. Get statistics
    console.log('\n5️⃣ Getting statistics...');
    const statsResponse = await axios.get(`${API_BASE}/books/stats`);
    console.log('📊 Statistics:', statsResponse.data);

    // 6. Test TTS queue status
    console.log('\n6️⃣ Testing TTS queue...');
    const ttsStatusResponse = await axios.get(`${API_BASE}/tts/queue/status`);
    console.log('🎙️ TTS Queue Status:', ttsStatusResponse.data);

    // 7. Test download queue status (if crawler is running)
    console.log('\n7️⃣ Testing download integration...');
    try {
      const downloadStatusResponse = await axios.get(`${API_BASE}/downloads/queue/status`);
      console.log('📥 Download Queue Status:', downloadStatusResponse.data);
    } catch (error) {
      console.log('⚠️ Crawler service not available:', error.response?.status);
    }

    // 8. Test search functionality
    console.log('\n8️⃣ Testing search integration...');
    try {
      const searchResponse = await axios.post(`${API_BASE}/downloads/search`, {
        query: 'javascript',
        limit: 3
      });
      console.log(`🔍 Search results: ${searchResponse.data.results?.length || 0} books found`);
    } catch (error) {
      console.log('⚠️ Search service not available:', error.response?.status);
    }

    // 9. Test TTS models
    console.log('\n9️⃣ Testing TTS models...');
    const modelsResponse = await axios.get(`${API_BASE}/tts/models`);
    console.log('🤖 Available TTS models:', modelsResponse.data);

    console.log('\n✅ Backend API test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

async function testWorkflow() {
  console.log('\n🔄 Testing Complete Workflow...\n');

  try {
    // Test workflow: Search -> Download -> Parse -> Generate TTS
    console.log('📋 Workflow Steps:');
    console.log('1. Search for a book');
    console.log('2. Download the book');
    console.log('3. Parse the book into chapters');
    console.log('4. Generate TTS for chapters');
    console.log('5. Stream the audio');

    console.log('\n🛠️ Manual workflow test commands:');
    console.log('\n# 1. Search for books:');
    console.log(`curl -X POST ${API_BASE}/downloads/search -H "Content-Type: application/json" -d '{"query": "python programming", "limit": 5}'`);
    
    console.log('\n# 2. Download a book (replace URL):');
    console.log(`curl -X POST ${API_BASE}/downloads/download -H "Content-Type: application/json" -d '{"bookUrl": "BOOK_URL_HERE"}'`);
    
    console.log('\n# 3. Parse the book (replace BOOK_ID):');
    console.log(`curl -X POST ${API_BASE}/parse/book/BOOK_ID -H "Content-Type: application/json" -d '{"chunkSize": 1500, "splitBy": "both"}'`);
    
    console.log('\n# 4. Generate TTS (replace BOOK_ID):');
    console.log(`curl -X POST ${API_BASE}/tts/generate/BOOK_ID -H "Content-Type: application/json" -d '{"voice": "default", "model": "bark"}'`);
    
    console.log('\n# 5. Stream audio (replace BOOK_ID and CHAPTER_ID):');
    console.log(`curl ${API_BASE}/audio/BOOK_ID/CHAPTER_ID --output chapter.mp3`);

  } catch (error) {
    console.error('❌ Workflow test failed:', error.message);
  }
}

// Check if backend is running
axios.get('http://localhost:5000/health')
  .then(() => {
    testBackend().then(() => {
      testWorkflow();
    });
  })
  .catch(() => {
    console.log('❌ Backend service is not running!');
    console.log('\nStart the backend service with:');
    console.log('cd backend && npm install && npm start');
    console.log('\nOr use Docker:');
    console.log('docker-compose up backend');
  });