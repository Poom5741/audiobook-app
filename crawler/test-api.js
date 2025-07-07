const axios = require('axios');

const API_BASE = 'http://localhost:3001/api';

async function testCrawlerAPI() {
  console.log('🧪 Testing Crawler API...\n');

  try {
    // 1. Test search
    console.log('1️⃣ Testing search endpoint...');
    const searchResponse = await axios.get(`${API_BASE}/search`, {
      params: {
        q: 'javascript',
        limit: 5
      }
    });
    console.log(`✅ Found ${searchResponse.data.count} books`);
    console.log('First result:', searchResponse.data.results[0]?.title);

    // 2. Get book details
    if (searchResponse.data.results.length > 0) {
      console.log('\n2️⃣ Testing book details endpoint...');
      const bookUrl = searchResponse.data.results[0].link;
      const detailsResponse = await axios.get(`${API_BASE}/search/details`, {
        params: { url: bookUrl }
      });
      console.log('✅ Book details:', {
        title: detailsResponse.data.title,
        author: detailsResponse.data.author,
        fileType: detailsResponse.data.fileType,
        downloadLinks: detailsResponse.data.downloadLinks.length
      });

      // 3. Queue download
      console.log('\n3️⃣ Testing download queue...');
      const downloadResponse = await axios.post(`${API_BASE}/download`, {
        bookUrl: bookUrl,
        priority: 0
      });
      console.log('✅ Download status:', downloadResponse.data);
    }

    // 4. Check queue status
    console.log('\n4️⃣ Testing queue status...');
    const queueResponse = await axios.get(`${API_BASE}/queue/status`);
    console.log('✅ Queue status:', queueResponse.data);

    // 5. Get download stats
    console.log('\n5️⃣ Testing download stats...');
    const statsResponse = await axios.get(`${API_BASE}/download/stats`);
    console.log('✅ Download stats:', statsResponse.data);

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run tests
testCrawlerAPI();