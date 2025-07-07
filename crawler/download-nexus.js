const axios = require('axios');

const API_BASE = 'http://localhost:3001/api';

async function downloadNexus() {
  console.log('🔍 Searching for "Nexus: A Brief History"...\n');
  
  try {
    // Search for the book
    const searchResponse = await axios.get(`${API_BASE}/search`, {
      params: {
        q: 'Nexus Brief History',
        limit: 5
      }
    });
    
    if (searchResponse.data.results.length === 0) {
      console.log('❌ Book not found. Trying alternative search...');
      
      // Try alternative search
      const altResponse = await axios.get(`${API_BASE}/search`, {
        params: {
          q: 'Yuval Noah Harari Nexus',
          limit: 5
        }
      });
      
      if (altResponse.data.results.length === 0) {
        console.log('❌ Still no results. The book might not be available.');
        return;
      }
      
      searchResponse.data = altResponse.data;
    }
    
    console.log(`✅ Found ${searchResponse.data.count} results:\n`);
    
    // Display results
    searchResponse.data.results.forEach((book, index) => {
      console.log(`${index + 1}. ${book.title}`);
      console.log(`   Author: ${book.author}`);
      console.log(`   ${book.details}\n`);
    });
    
    // Look for the Nexus book specifically
    const nexusBook = searchResponse.data.results.find(book => 
      book.title.toLowerCase().includes('nexus') && 
      (book.author.toLowerCase().includes('harari') || book.title.toLowerCase().includes('brief'))
    );
    
    if (!nexusBook) {
      console.log('⚠️  Could not find exact match. Downloading first result...');
      const firstBook = searchResponse.data.results[0];
      await downloadBook(firstBook);
    } else {
      console.log('📖 Found Nexus book! Getting details...');
      await downloadBook(nexusBook);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

async function downloadBook(book) {
  try {
    // Get full book details
    console.log(`\n📘 Fetching details for: ${book.title}`);
    
    const detailsResponse = await axios.get(`${API_BASE}/search/details`, {
      params: { url: book.link }
    });
    
    const details = detailsResponse.data;
    
    console.log('\n📚 Book Information:');
    console.log(`Title: ${details.title}`);
    console.log(`Author: ${details.author}`);
    console.log(`Type: ${details.fileType}`);
    console.log(`Size: ${details.fileSize}`);
    console.log(`Language: ${details.language}`);
    console.log(`Available sources: ${details.downloadLinks.length}`);
    
    // Queue the download
    console.log('\n⬇️  Starting download...');
    
    const downloadResponse = await axios.post(`${API_BASE}/download`, {
      bookUrl: book.link,
      priority: 1 // Higher priority
    });
    
    if (downloadResponse.data.status === 'exists') {
      console.log('\n✅ Book already exists in your library!');
      console.log(`📁 Location: ${downloadResponse.data.filePath}`);
    } else if (downloadResponse.data.status === 'queued') {
      console.log('\n✅ Download queued successfully!');
      console.log(`Job ID: ${downloadResponse.data.jobId}`);
      console.log(`Queue ID: ${downloadResponse.data.queueId}`);
      
      console.log('\n📊 Monitoring download progress...');
      await monitorProgress(downloadResponse.data.jobId);
    }
    
  } catch (error) {
    console.error('\n❌ Download error:', error.response?.data || error.message);
  }
}

async function monitorProgress(jobId) {
  let completed = false;
  let lastProgress = 0;
  let checkCount = 0;
  
  while (!completed && checkCount < 60) { // Max 2 minutes of checking
    try {
      const statusResponse = await axios.get(`${API_BASE}/queue/status`);
      console.log(`\rQueue - Active: ${statusResponse.data.active}, Waiting: ${statusResponse.data.waiting}`);
      
      // Check active jobs
      const activeJobs = await axios.get(`${API_BASE}/queue/jobs`, {
        params: { status: 'active' }
      });
      
      const job = activeJobs.data.find(j => j.id == jobId);
      
      if (job && job.progress > lastProgress) {
        process.stdout.write(`\rDownload Progress: ${job.progress}% `);
        lastProgress = job.progress;
      }
      
      // Check completed jobs
      const completedJobs = await axios.get(`${API_BASE}/queue/jobs`, {
        params: { status: 'completed' }
      });
      
      if (completedJobs.data.find(j => j.id == jobId)) {
        console.log('\n\n✅ Download completed successfully!');
        console.log('📁 Book saved to /books directory');
        completed = true;
        break;
      }
      
      // Check failed jobs
      const failedJobs = await axios.get(`${API_BASE}/queue/jobs`, {
        params: { status: 'failed' }
      });
      
      const failedJob = failedJobs.data.find(j => j.id == jobId);
      if (failedJob) {
        console.log('\n\n❌ Download failed:', failedJob.failedReason);
        completed = true;
        break;
      }
      
      checkCount++;
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error('\n❌ Monitoring error:', error.message);
      break;
    }
  }
  
  if (!completed) {
    console.log('\n\n⏱️  Download is still in progress. Check back later.');
    console.log('Use: curl http://localhost:3001/api/queue/status');
  }
}

// Check if service is running
console.log('🎧 Nexus Book Downloader\n');
console.log('Checking crawler service...');

axios.get('http://localhost:3001/health')
  .then(() => {
    console.log('✅ Crawler service is running!\n');
    downloadNexus();
  })
  .catch(() => {
    console.log('❌ Crawler service is not running!');
    console.log('\nPlease start the services first:');
    console.log('1. Run: ./test-download.sh');
    console.log('2. Wait for services to start');
    console.log('3. Run this script again');
    process.exit(1);
  });