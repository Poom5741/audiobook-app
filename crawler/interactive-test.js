const axios = require('axios');
const readline = require('readline');

const API_BASE = 'http://localhost:3001/api';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function searchBooks() {
  const query = await question('\n📚 Enter book title or author to search: ');
  
  console.log(`\n🔍 Searching for "${query}"...`);
  
  try {
    const response = await axios.get(`${API_BASE}/search`, {
      params: { q: query, limit: 10 }
    });
    
    if (response.data.results.length === 0) {
      console.log('❌ No books found. Try a different search term.');
      return null;
    }
    
    console.log(`\n✅ Found ${response.data.count} books:\n`);
    
    response.data.results.forEach((book, index) => {
      console.log(`${index + 1}. ${book.title}`);
      console.log(`   Author: ${book.author}`);
      console.log(`   ${book.details}\n`);
    });
    
    return response.data.results;
  } catch (error) {
    console.error('❌ Search failed:', error.message);
    return null;
  }
}

async function downloadBook(bookUrl) {
  try {
    console.log('\n📖 Getting book details...');
    
    // First get full details
    const detailsResponse = await axios.get(`${API_BASE}/search/details`, {
      params: { url: bookUrl }
    });
    
    const details = detailsResponse.data;
    console.log('\n📘 Book Details:');
    console.log(`Title: ${details.title}`);
    console.log(`Author: ${details.author}`);
    console.log(`Type: ${details.fileType}`);
    console.log(`Size: ${details.fileSize}`);
    console.log(`Language: ${details.language}`);
    console.log(`Download sources: ${details.downloadLinks.length}`);
    
    const confirm = await question('\n💾 Download this book? (y/n): ');
    
    if (confirm.toLowerCase() !== 'y') {
      console.log('❌ Download cancelled.');
      return;
    }
    
    console.log('\n⬇️  Adding to download queue...');
    
    const downloadResponse = await axios.post(`${API_BASE}/download`, {
      bookUrl: bookUrl,
      priority: 0
    });
    
    if (downloadResponse.data.status === 'exists') {
      console.log('ℹ️  Book already exists in library!');
      console.log(`📁 File: ${downloadResponse.data.filePath}`);
    } else {
      console.log('✅ Added to download queue!');
      console.log(`Job ID: ${downloadResponse.data.jobId}`);
      console.log('\n📊 Monitoring download progress...');
      
      // Monitor progress
      await monitorDownload(downloadResponse.data.jobId);
    }
    
  } catch (error) {
    console.error('❌ Download failed:', error.response?.data?.message || error.message);
  }
}

async function monitorDownload(jobId) {
  let completed = false;
  let lastProgress = 0;
  
  while (!completed) {
    try {
      const response = await axios.get(`${API_BASE}/queue/jobs`, {
        params: { status: 'active' }
      });
      
      const job = response.data.find(j => j.id === jobId);
      
      if (!job) {
        // Check if completed
        const completedResponse = await axios.get(`${API_BASE}/queue/jobs`, {
          params: { status: 'completed' }
        });
        
        const completedJob = completedResponse.data.find(j => j.id === jobId);
        
        if (completedJob) {
          console.log('\n✅ Download completed!');
          completed = true;
          break;
        }
        
        // Check if failed
        const failedResponse = await axios.get(`${API_BASE}/queue/jobs`, {
          params: { status: 'failed' }
        });
        
        const failedJob = failedResponse.data.find(j => j.id === jobId);
        
        if (failedJob) {
          console.log('\n❌ Download failed:', failedJob.failedReason);
          completed = true;
          break;
        }
      } else {
        // Show progress
        if (job.progress > lastProgress) {
          process.stdout.write(`\rProgress: ${job.progress}%`);
          lastProgress = job.progress;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error('\n❌ Error monitoring download:', error.message);
      break;
    }
  }
}

async function showQueueStatus() {
  try {
    const response = await axios.get(`${API_BASE}/queue/status`);
    const stats = response.data;
    
    console.log('\n📊 Queue Status:');
    console.log(`Waiting: ${stats.waiting}`);
    console.log(`Active: ${stats.active}`);
    console.log(`Completed: ${stats.completed}`);
    console.log(`Failed: ${stats.failed}`);
    console.log(`Total: ${stats.total}`);
    
  } catch (error) {
    console.error('❌ Failed to get queue status:', error.message);
  }
}

async function main() {
  console.log('🎧 Audiobook Downloader - Interactive Test\n');
  
  while (true) {
    console.log('\n========================================');
    console.log('Choose an option:');
    console.log('1. Search and download a book');
    console.log('2. Check queue status');
    console.log('3. Exit');
    
    const choice = await question('\nEnter choice (1-3): ');
    
    switch (choice) {
      case '1':
        const books = await searchBooks();
        if (books && books.length > 0) {
          const bookNum = await question('Enter book number to download (or 0 to cancel): ');
          const index = parseInt(bookNum) - 1;
          
          if (index >= 0 && index < books.length) {
            await downloadBook(books[index].link);
          }
        }
        break;
        
      case '2':
        await showQueueStatus();
        break;
        
      case '3':
        console.log('\n👋 Goodbye!');
        rl.close();
        process.exit(0);
        
      default:
        console.log('❌ Invalid choice. Please try again.');
    }
  }
}

// Check if services are running
axios.get(`${API_BASE}/../health`)
  .then(() => {
    console.log('✅ Crawler service is running!\n');
    main();
  })
  .catch(() => {
    console.log('❌ Crawler service is not running!');
    console.log('Please run: ./test-download.sh');
    process.exit(1);
  });