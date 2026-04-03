import BookCard from '@/components/BookCard';
import HeroSection from '@/components/HeroSection';
import { getAllBooks } from '@/lib/actions/book.actions';
import { TriangleAlert } from 'lucide-react';

async function page() {
  const bookResults = await getAllBooks();
  const books = bookResults.success ? bookResults.data ?? [] : [];
  const loadError = bookResults.success ? null : (typeof bookResults.error === 'string' ? bookResults.error : 'Failed to load books.');

  return (
    <main className='wrapper pt-28 mb-10 md:mb-16'>
      <HeroSection />

      {loadError ? (
        <div className='error-banner mt-8'>
          <div className='error-banner-content'>
            <div className='flex items-start gap-3'>
              <TriangleAlert className='error-banner-icon' />
              <div>
                <p className='font-semibold text-red-700'>Unable to load your library</p>
                <p className='text-sm text-red-600 mt-1'>{loadError}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className='library-books-grid mt-20'>
        {
          books.map((book)=>(
            <BookCard key={book._id}  title={book.title} author={book.author} coverURL={book.coverURL} slug={book.slug}/>
          ))
        }
      </div>
    </main>
  )
}

export default page