import { Link } from 'react-router-dom';

export default function NotFound() {
  return <main className="max-w-3xl mx-auto px-6 py-24 text-text-primary">
    <h1 className="text-3xl font-bold mb-4">Page not found</h1>
    <p className="text-text-secondary mb-6">This page does not exist.</p>
    <Link to="/" className="text-primary underline">Return home</Link>
  </main>;
}
