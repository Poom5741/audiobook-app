import { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Audiobook Player',
  description: 'Self-hosted audiobook streaming platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav className="navbar">
          <div className="nav-container">
            <h1 className="nav-title">
              <a href="/">📚 Audiobook Player</a>
            </h1>
            <div className="nav-links">
              <a href="/" className="nav-link">Books</a>
            </div>
          </div>
        </nav>
        
        <main className="main-content">
          {children}
        </main>
        
        <footer className="footer">
          <p>&copy; 2024 Self-hosted Audiobook System</p>
        </footer>
      </body>
    </html>
  );
}