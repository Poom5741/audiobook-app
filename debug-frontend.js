// Debug script to check what's happening with the book ID
console.log('=== DEBUGGING BOOK ID ISSUE ===');

// Check if we can access the books data
setTimeout(() => {
  console.log('1. Checking all links with book paths...');
  const bookLinks = document.querySelectorAll('a[href*="/book/"]');
  bookLinks.forEach((link, index) => {
    console.log(`  Link ${index}: ${link.href}`);
  });
  
  console.log('2. Checking for undefined in URLs...');
  const undefinedLinks = document.querySelectorAll('a[href*="undefined"]');
  console.log(`  Found ${undefinedLinks.length} undefined links`);
  
  console.log('3. Checking localStorage...');
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    console.log(`  ${key}: ${localStorage.getItem(key)}`);
  });
  
  console.log('4. Checking console errors...');
  // This will show any JS errors
  
  console.log('5. Making direct API call to check data...');
  fetch('http://localhost:5001/api/books')
    .then(response => response.json())
    .then(data => {
      console.log('  API Response:', data);
      if (data.books && data.books.length > 0) {
        console.log('  First book ID:', data.books[0].id);
      }
    })
    .catch(err => console.error('  API Error:', err));
    
}, 2000);